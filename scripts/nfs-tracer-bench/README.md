# NFS tracer bench (T1.0a)

The minimal bench the Marketplace tracer runs on: the NFS host image, a real
Postgres, and a Marketplace catalog fixture. It comes up reproducibly and tears
down clean.

Deliberately **not** here: k3d, MinIO, Grafana, GitLab. The tracer does not use
them; T1.0b adds them later for the T5.6b/T5.6d proofs.

## Quick start

```bash
./bench.sh fetch      # unpack the catalog module from the CI run (once)
./bench.sh up         # start, wait for readiness, print a summary
./bench.sh entities   # what the catalog actually holds
./bench.sh down       # remove everything
```

`fetch` is not optional — see [Why the module is not optional](#why-the-module-is-not-optional).

## Commands

| Command | What it does |
|---|---|
| `./bench.sh fetch [run-id]` | Pulls the `dynamic plugin packages` artifact from a CI run and unpacks `catalog-backend-module-extensions` into `artifacts/`. Defaults to run `30951225286` (the T2.2 export). Publishes nothing. |
| `./bench.sh up` | Starts Postgres, waits for it to be healthy, starts the host, waits for readiness, then reports the database in effect and the ingested entities. |
| `./bench.sh down` | `compose down -v --remove-orphans`. Nothing survives. |
| `./bench.sh status` | `compose ps`. |
| `./bench.sh logs [-f]` | Host logs. |
| `./bench.sh psql [args]` | `psql` inside the Postgres container. |
| `./bench.sh entities` | Plugin/Package entities plus their derived relations. |

### Parallel instances

`-n <name>` gives an independent bench whose ports are derived from a stable hash
of the name, so several run at once:

```bash
./bench.sh -n t13 up            # its own containers, ports and database
./bench.sh -n t13 psql -c '\dt'
./bench.sh -n t13 down
```

The default instance keeps ports `17707` (host) and `15432` (Postgres) so results
stay comparable. `BENCH_HTTP_PORT` / `BENCH_PG_PORT` override explicitly.

This matters beyond convenience: T1.1, T1.2 and T1.3 each need a bench, and a
single-instance bench would serialise all of them.

## Versions

Everything is pinned by digest. No moving tags — the plan tracks evidence by
digest, and a floating tag would invalidate it silently.

| Component | Pin |
|---|---|
| NFS host | `veecode/devportal@sha256:676d288f4c105121b21269717cd27db080c3d64b3eac062ba193fb7e4d620a1d` |
| Postgres | `postgres@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193` (`17-alpine`, 2026-08-04) |
| Node (inside the host image) | `v22.22.2` — the runtimeNode of the tuple |
| Catalog module | `@red-hat-developer-hub/backstage-plugin-catalog-backend-module-extensions-dynamic` **0.19.1**, from the T2.2 export |

About the host pin: two NFS images exist locally. `676d288f` is the one CI
produced (pulled by digest, created 2026-08-03T23:08Z, entrypoint
`/app/entrypoint.nfs.sh`); `dd466ef5` is a local rebuild from three hours
earlier, tagged `devportal-nfs-rebuild` / `veecode/devportal-nfs` /
`ghcr.io/veecode-platform/devportal-nfs`. The bench uses the CI one. Note the tag
`veecode/devportal:2.3.0-rc.2-nfs.g07bc64b` that older notes cite **does not
exist** — the digest is what is real.

Postgres has no version pinned anywhere in this repo (no compose ships one and
ADR-014 does not fix one), so `17-alpine` is this bench's choice, not a product
constraint.

## How it plugs into the host without changing it

No host code is modified. Three hooks already exist in the image:

| Hook | Where | Bench use |
|---|---|---|
| `/app/app-config.local.yaml` is appended when present | `docker/entrypoint.nfs.sh:30-32` | mounts `config/app-config.bench.yaml` — Postgres and the catalog location |
| `/app/dynamic-plugins.yaml` wins over the empty image default | `docker/entrypoint.nfs.sh:10-14` | mounts the inventory `bench.sh` generates |
| `package: ./<dir>` installs from a local path, skipping the integrity check | `docker/install-dynamic-plugins.py:49,271-289,442` | loads the module from `artifacts/` with no registry |

Config layering the entrypoint builds, in order:

```
app-config.yaml → app-config.production.yaml → app-config.nfs.yaml
  → app-config.local.yaml (the bench overlay) → dynamic-plugins-root/app-config.dynamic-plugins.yaml
```

## The fixture

`fixtures/marketplace-tracer.yaml` declares one `Plugin` (`veecode/marketplace`)
and three `Package` entities — the frontend, the backend and pending-changes —
each carrying the `spec.dynamicArtifact` from the bundle tag `bs_1.53.0`.

The chain the tracer needs:

```
Plugin --relations--> Package --spec.dynamicArtifact--> OCI ref
```

`ExtensionsCatalogClient.getPluginPackages()` reads `plugin.relations` and keeps
only `partOf`/`hasPart` whose `targetRef` starts with `package:`
(`extensions-common/src/api/ExtensionsCatalogClient.ts:225-247`). Then
`InstallationDataService.getPluginDynamicArtifacts()` collects each Package's
`spec.dynamicArtifact`.

**Relations are derived, never declared.** `relations` is catalog output, not
entity input. Two processors emit them, and either side is enough:

- `ExtensionsPackageProcessor` reads `Package.spec.partOf` (`…:92-116`)
- `ExtensionsPluginProcessor` reads `Plugin.spec.packages` (`…:134-152`)

The fixture declares **both** sides so it behaves the same whichever processor
runs.

`pending-changes` is present as a **candidate only**. The 04/08 export produced a
valid artifact whose `mf-manifest` exposes just `.` — no `alpha` — so the NFS
loader finds no `FrontendPlugin` in it. That is the open T5.1 work, not an export
defect. Do not read it as certified or supported.

## Why the module is not optional

Measured on this bench, not assumed. Without
`catalog-backend-module-extensions` loaded, the host logs:

```
No processor recognized the entity plugin:veecode/marketplace as valid,
possibly caused by a foreign kind or apiVersion
```

and the catalog holds **0 Plugin and 0 Package** entities. `catalog.rules` in
`app-config.yaml` allows the kinds, but allowing is not validating: with no
processor claiming them, the entities are **rejected outright** — they do not
ingest without relations, they do not ingest at all.

With the module loaded, `./bench.sh entities` reports all four plus the
bidirectional relations. So the bench has two modes, and `up` prints which one is
active:

| Mode | Condition | Result |
|---|---|---|
| `with-catalog-module` | `artifacts/catalog-backend-module-extensions/package.json` exists | fixture ingests, relations derived |
| `empty-host` | it does not | fixture rejected — useful only to reproduce the rejection |

## Notes for the tasks that follow

**T1.1 (pre-step fail-closed).** `config/app-config.bench.yaml` sets
`backend.database.client: pg`, which is exactly the gate
`docker/regenerate-extensions-install.js` tests before acting. On this image the
pre-step is **not wired into the NFS entrypoint at all** — `entrypoint.nfs.sh`
runs the Python installer and starts the backend, nothing else. The helper's own
header states its current contract: *"Never hard-fail the boot: on any config/DB/
write error, leave the file the entrypoint already guaranteed in place and log a
warning."* That fail-open is what D-G5 turns fail-closed on the NFS path only;
the OFS path (`entrypoint.sh:322-338`) stays as it is.

**T1.3 (requestedRef + resolvedDigest).** `pluginDivisionMode` is left at its
default `database`, so Backstage puts each plugin's tables in its own database.
Confirmed on this bench: 19 databases appear (`backstage_plugin_catalog`,
`backstage_plugin_auth`, …). There is **no `backstage_plugin_extensions` yet**,
because the marketplace backend is not loaded here — only the catalog module is.
`marketplace_installations` (`package_name`, `disabled`, `config_yaml`,
`updated_at`) will land in that database once the backend runs. The pre-step
discovers the owning schema through `information_schema` instead of guessing, so
both division modes work.

The bench Postgres role is the image default superuser, which it needs: with
`pluginDivisionMode: database` Backstage has to `CREATE DATABASE`.

**Health endpoint.** The bench polls `/.backstage/health/v1/readiness`, which is
unauthenticated (verified: 200). It does **not** use `/api/healthcheck` — on this
image that route requires auth and answers **401**, so it can never mark the
container healthy. The local `bench/run-boot.sh` harness still polls
`/api/healthcheck` expecting 200; that holds for the OFS image, not this one.
(`bench/` is listed in `.git/info/exclude`, so it is a local working directory,
not part of the repo — which is why this bench lives under `scripts/`.)

## What this bench proves, and what it does not

**Proves**, reproducibly (two consecutive cycles, ~38s each):

- the NFS host boots against a real Postgres from empty — `Database is
  PostgreSQL, using database store`;
- Postgres is reachable from the image and Backstage provisions its databases;
- the Marketplace fixture ingests and its Plugin↔Package relations are derived;
- a locally built plugin package loads with no registry;
- teardown leaves no container, volume or network behind.

**Does not prove.** No Marketplace UI, no install flow, no row in
`marketplace_installations`, no `extensions-install.yaml`, no restart/restore, no
`$$type` resolution in the browser. Those are the tracer (T3.0), and they need
T1.1, T1.2, T1.3 and the minimal candidate image (T1.5) first. The bench is
where they will be proven, not a proof itself.
