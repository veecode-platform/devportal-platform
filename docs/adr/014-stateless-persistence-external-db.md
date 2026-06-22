# ADR-014 — Stateless persistence: external Postgres + boot regeneration of `extensions-install.yaml`

**Status:** Accepted
**Date:** 2026-06-22
**Related:** [ADR-010](./010-unified-image-and-presets.md), [ADR-013](./013-plugin-catalog-model.md)
**Implements:** WS1 boot pre-step — [`docs/superpowers/plans/2026-06-22-stateless-persistence-pre-step.md`](../superpowers/plans/2026-06-22-stateless-persistence-pre-step.md)

## Context

V2 made on-disk persistence a hard requirement. The chart provisions two `ReadWriteOnce` PVCs:

- `/app/data` — the Backstage SQLite database **and** `extensions-install.yaml` (the operator's marketplace
  selections).
- `/app/dynamic-plugins-root` — the OCI plugin bundles downloaded at boot.

On AWS these PVCs land on EBS, which is **single-AZ**. A `ReadWriteOnce` EBS volume binds the pod to the one
Availability Zone its volume lives in. This turned a routine event into a sustained outage:

- **Incident 2026-06-22:** the EKS cluster's Spot capacity for the node instance type dried up in the volumes'
  AZ (`us-east-2a`). With no node available in that AZ, the single-replica DevPortal pod could not be
  scheduled and served **503 for ~2h30** — it did not self-recover.
- **V1 did not have this failure mode.** V1 ran SQLite `:memory:` (no PVC), so the pod could schedule in any
  AZ and recovered within minutes. The persistence delta introduced in V2 is what created the AZ pin.

### What actually must persist

Investigation of the boot path (`entrypoint.sh`, `docker/install-dynamic-plugins.py`) and the marketplace
backend (`veecode-platform/devportal-plugins`) established:

- Plugin install runs **only at boot** — the Python installer reads YAML files, pulls OCI bundles, extracts
  to `/app/dynamic-plugins-root`. Managing plugins already requires a restart to take effect today (the
  Marketplace UI writes the selection immediately but it activates on the next boot; the `pending-changes`
  plugin surfaces a "restart needed" badge).
- **The database is the source of truth** for plugin-management state, not the file. The marketplace backend
  persists selections to its DB table and regenerates `extensions-install.yaml` as a **write-through cache** on
  every change (the file is `${DEVPORTAL_DB_PATH:-/app/data}/extensions-install.yaml`).
- `/app/dynamic-plugins-root` is a **pure download cache** — losing it only re-pulls the bundles (~60–90s),
  which is acceptable.
- With Postgres configured, the marketplace state lives in table `marketplace_installations` (columns
  `package_name PK`, `disabled`, `config_yaml`, `updated_at`) in database `backstage_plugin_extensions`
  (Backstage creates one database per plugin). `/app/data` then holds **only** the regenerable
  `extensions-install.yaml` — no SQLite.

The only reason `/app/data` must currently survive a restart is a **boot-ordering gap**: the standalone Python
installer reads the *file* and runs *before* the Node backend, so it cannot read the DB; the file must exist on
disk when the installer runs.

## Decision

Make DevPortal V2 **deployable fully stateless**, with the operator's plugin-management state held in an
**external database** rather than on an AZ-bound volume:

1. **Database → external Postgres.** Set `backend.database.client: pg`. The `pg` driver is already baked into
   the image. The marketplace backend already supports Postgres. This moves all plugin-management state off
   `/app/data`.
2. **Both volumes become ephemeral.** `/app/dynamic-plugins-root` re-pulls at boot (cache); `/app/data` no
   longer needs to persist.
3. **Add a boot pre-step that regenerates `extensions-install.yaml` from the database before the installer
   runs.** It reads `marketplace_installations` from the `backstage_plugin_extensions` database and writes the
   file the installer expects. The regeneration logic is small and isolated (the marketplace backend's
   `syncToYamlFile` is ~14 lines with no Backstage-runtime coupling); a standalone init step is ~20–25 lines
   (Postgres client + YAML).

The result requires **zero persistent volumes**. The only per-deployment dependency is a Postgres instance.
Persistence on `/app/data` (RWX) becomes an *optional* deployment choice, not a requirement.

### Validated by spike (2026-06-22, docker-compose, image `2.1.3`, preset `recommended`, no credentials)

- V2 boots clean against external Postgres (`"Database is PostgreSQL, using database store"`,
  `Listening on 0.0.0.0:7007`, no exit 78) with **no plugins volume**.
- `marketplace_installations` confirmed in `backstage_plugin_extensions`; `/app/data` held only the 14-byte
  `extensions-install.yaml` (no SQLite).
- The ~20-line pre-step regenerated a correct `extensions-install.yaml` from the live DB.
- **End-to-end:** with `/app/data` wiped (fresh pod), the pre-step regenerated the file and the operator's
  selected plugin (`sonarqube`) **installed on the same boot** (`Successfully installed dynamic plugin
  oci://.../sonarqube`) — no one-restart lag.

## Implementation (WS1, image only)

The pre-step is [`docker/regenerate-extensions-install.js`](../../docker/regenerate-extensions-install.js),
invoked from [`entrypoint.sh`](../../entrypoint.sh) in a new phase **before** `install-dynamic-plugins.py`
(after the SaaS/preset config files are assembled, before the `${BACKSTAGE_VERSION}`/`${PLUGIN_REGISTRY}`
substitution so the regenerated file gets the same treatment). It is `COPY`'d to `/app/` by the `Dockerfile`.

- **Node, not Python.** The runtime image has no `psycopg2` and no build toolchain (no gcc/make), so a Python
  Postgres driver would mean a new image dependency and a compile risk. The Node `pg` driver and `yaml` are
  already baked (production deps of the backend), so the Node implementation adds **zero** new dependencies.
- **Config resolution.** There is no assembled app-config on disk at boot — the entrypoint passes a chain of
  `--config` files that Node deep-merges in memory. The pre-step reads the **same chain** with the baked
  `@backstage/config-loader` (env `${VAR:-default}` substitution included), so the gate (`backend.database.client
  === 'pg'`) and the connection/`pluginDivisionMode` it sees are exactly what the backend sees — including the
  SaaS `VEECODE_APP_CONFIG` overlay.
- **Schema targeting.** The owning schema is **discovered** via `information_schema` rather than hardcoded, so
  both `pluginDivisionMode: database` (separate database `backstage_plugin_extensions`) and `schema` (a schema
  inside the connection's database, the SaaS configuration) work without guessing a schema name.
- **Bounded fail-safe.** The pg client sets `connectionTimeoutMillis` (5s) and `statement_timeout` (10s) — without
  a connect timeout an unreachable DB would **hang the boot** instead of degrading. On any config/DB/write error
  the pre-step logs a warning, leaves the file the entrypoint already guaranteed in place, and **exits 0**.

**Schema contract (pinned).** The pre-step reads table `marketplace_installations` (columns `package_name`,
`disabled`, `config_yaml`) as written by `devportal-marketplace-backend`
(`oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-backend`, the `bs_1.49.4`
line tracked by `EXTENSIONS_TAG`). This schema is not a formal public contract; a future marketplace-plugin bump
that changes those columns must be matched here. The output format mirrors the marketplace's own
`saveToSingleFile` write-through (`{plugins: [...]}`).

**Verification.** Pure transforms covered by [`docker/test_regenerate_extensions_install.js`](../../docker/test_regenerate_extensions_install.js)
(`node --test`); the five end-to-end scenarios (database mode, schema mode, SQLite no-op, unreachable/missing-table
degrade, idempotency) validated against a live Postgres per the WS1 plan's spike rig.

## Consequences

### Benefits

- **AZ-independent and self-recovering** — no PVC, so the pod schedules in any AZ; a Spot/node loss recovers
  like V1 did. Removes the V2 outage class.
- **Portable AWS + on-prem with a single dependency** — every deployment needs only a Postgres (RDS on AWS, the
  customer's Postgres on-prem). No `ReadWriteMany` storage class (EFS/NFS/Longhorn) required at any site.
  Postgres is a near-universal Backstage dependency; RWX storage is not.
- **Marketplace UI and plugin management are unchanged** — install/enable/disable/configure still work and
  still persist (now in Postgres); the dynamic-plugin model is preserved (no static baking into the image).

### Costs / accepted

- The pre-step must be built and maintained in the image (init container or entrypoint pre-phase before the
  installer).
- Cold-boot is ~60–90s slower (plugin re-pull), and boot now depends on the OCI registry being reachable. For
  air-gapped on-prem, mirror the plugin registry (`PLUGIN_REGISTRY`), noting MCP refs are hardcoded to
  `quay.io/veecode` and must be mirrored separately.
- State that lived only in SQLite and is not GitLab/SCM-sourced (e.g. scaffolder task history) moves to
  Postgres with the DB; nothing is lost as long as Postgres persists.

### Risks

- **Schema coupling.** The pre-step reads `marketplace_installations` directly. The schema is not a formal
  public contract. Mitigate by pinning the marketplace plugin version and guarding the pre-step (validate the
  table exists; degrade to an empty file rather than crash).
- **Database targeting.** The table lives in the per-plugin database `backstage_plugin_extensions`, not the
  default database — the pre-step must connect to the correct database/schema (depends on
  `backend.database.pluginDivisionMode`).

## Alternatives considered

- **Persist `/app/data` on `ReadWriteMany` storage (EFS/NFS/Longhorn) — no image change.** Works on paper, but
  imposes an RWX storage class on every deployment including on-prem, and the entrypoint preflight requires an
  **atomic rename** in `DEVPORTAL_DB_PATH` (exit 78 on failure) — atomic-rename semantics on NFS/EFS are an
  unvalidated risk. Kept as a fallback only if the in-image pre-step is undesirable.
- **On-demand node pinned to the volume's AZ (AWS).** A symptom fix: it keeps the AZ pin and the structural
  fragility, costs a standing on-demand node, and is AWS-only (no on-prem analog). Rejected as a durable
  answer.
- **GitOps-only plugin management (drop the Marketplace UI).** Would make `/app/data` unnecessary with no image
  change, but the Marketplace UI is a required management surface. Rejected.
- **Bake the desired plugins statically into a custom image.** Removes the runtime pull but contradicts the
  dynamic-plugin product thesis (operators must add/change plugins without rebuilding the image). Rejected.

## Notes for downstream consumers

This is a **product/image** decision. Each deployment that adopts it owns its own infrastructure change —
e.g. the `plataforma-interna` internal deployment provisions an external Postgres (RDS, a *permanent*-class
resource per its own IaC charter) and flips the chart values; that work is tracked in that repository, not
here.
