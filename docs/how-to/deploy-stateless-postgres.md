---
name: deploy-stateless-postgres
description: Deploy DevPortal V2 fully stateless against external Postgres — no PersistentVolumeClaim, pod schedules in any AZ and self-recovers.
type: how-to
audience: [operator]
related: [installing, configuration-layering]
---

# Deploy stateless with external Postgres

This is the **recommended production deployment**. With an external Postgres
and no volumes, the DevPortal pod carries no AZ-bound state: it schedules in
any Availability Zone and self-recovers from a node/Spot loss — the failure
class that motivated [ADR-014](../adr/014-stateless-persistence-external-db.md).

SQLite and Postgres-with-a-persistent-volume still work, but they pin the pod
to a volume and are not the recommended path.

## How it works

Plugin install runs **only at boot**, from the file
`${DEVPORTAL_DB_PATH:-/app/data}/extensions-install.yaml`. The marketplace
backend is the source of truth and persists the operator's selections to the
database — with Postgres, into the `marketplace_installations` table.

The standalone Python installer runs *before* the Node backend, so it cannot
read the database itself. A boot pre-step closes that gap:

```
entrypoint.sh
  → [pg only] regenerate-extensions-install.js   ← rebuilds extensions-install.yaml from Postgres
  → install-dynamic-plugins.py                    ← installs the plugins it names
  → node packages/backend                         ← serves traffic
```

`docker/regenerate-extensions-install.js` connects to the same database the
backend uses (it reads the identical `--config` chain), discovers the owning
schema via `information_schema` (so both `pluginDivisionMode: database` and
`schema` work), and regenerates the file. It is a **no-op for SQLite** and
**degrades on any error** — on an unreachable DB or bad config it logs a
warning and continues with the existing file, never blocking boot.

Result: a fresh, volume-less `/app/data` recovers every selection on the next
boot, and `/app/dynamic-plugins-root` is a pure download cache (~60–90s to
re-pull on a cold start).

## Steps

### 1. Provision Postgres

Any reachable Postgres works (AWS RDS, the customer's own instance, CNPG). For
the AZ-independence goal on AWS, prefer a **Multi-AZ** RDS instance — the
database is now the single durable dependency, so its availability is the
deployment's availability.

### 2. Point `backend.database` at it

Supply a Postgres `backend.database` block via `app-config.local.yaml` (bind
mount) or the `VEECODE_APP_CONFIG` base64 overlay:

```yaml
backend:
  database:
    client: pg
    connection:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}
      # Enable TLS for managed/remote Postgres. For a private CA, pass the
      # CA cert — `ssl.ca` accepts an inline PEM or a $file reference.
      ssl:
        rejectUnauthorized: true
        ca: ${POSTGRES_CA_CERT}
```

This is standard Backstage config; the `pg` driver is already baked into the
image.

### 3. Drop the volumes

Remove **both** PVCs and their mounts. In `examples/deploy/k8s.yaml`, delete
the two `PersistentVolumeClaim` resources, the `volumeMounts` for `/app/data`
and `/app/dynamic-plugins-root`, and the matching `volumes` entries. The
Deployment keeps only the env (use a `Secret` for the Postgres password) and,
optionally, the config `ConfigMap`.

> `/app/data` and `/app/dynamic-plugins-root` are still written at runtime —
> they simply use the pod's ephemeral filesystem now. That is intended: both
> are caches, not state.

### 4. Verify the boot

Watch the logs. A healthy stateless boot shows the installer pulling the
operator's selected plugins on the **first** boot of a fresh pod:

```
======= Installing dynamic plugin oci://quay.io/veecode/tech-radar:bs_1.49.4!...
        ==> Successfully installed dynamic plugin oci://quay.io/veecode/tech-radar:...
...
Database is PostgreSQL, using database store
Listening on 0.0.0.0:7007
```

You should **not** see the line
`VEECODE: WARNING — stateless pre-step exited non-zero` — that indicates the
pre-step could not reach the database (it degraded rather than failed the
boot, so the pod still came up, but it booted with whatever
`extensions-install.yaml` already existed). If you see it, check the
`backend.database` connection and TLS settings.

## Caveats

- **OCI registry reachability.** A cold stateless boot re-pulls every selected
  plugin bundle. For air-gapped sites, mirror `PLUGIN_REGISTRY` and ensure it
  holds **every** plugin your operators have selected — an unpullable ref makes
  `install-dynamic-plugins.py` fail and aborts boot (exit 78). MCP plugin refs
  are hardcoded to `quay.io/veecode` and must be mirrored separately.
- **Postgres is now the durability boundary.** Anything that lived only in
  SQLite (e.g. scaffolder task history) moves to Postgres. Back it up and run
  it highly-available — losing it loses that state.
