---
title: Running the published NFS host image with Docker Compose
status: active
updated: 2026-08-06
---

# Running the NFS host image

```bash
docker compose up
# open http://localhost:7007
```

That is it. The image carries the app-next host, the NFS entrypoint and the dynamic-plugin
installer; this directory only adds Postgres and one config override.

## What is in here

| File | Why |
|---|---|
| `docker-compose.yaml` | the image + Postgres, pinned by digest |
| `app-config.local.yaml` | switches the backend off SQLite onto Postgres |

The entrypoint appends `--config /app/app-config.local.yaml` on its own when that file is
mounted (`docker/entrypoint.nfs.sh`), so there is no env var to wire the override in.

This is **not** `scripts/nfs-tracer-bench/`. That bench exists to prove things and carries
fixtures, browser probes and a JSON report. This one just runs the image.

## The image is pinned by digest, on purpose

```yaml
image: veecode/devportal@sha256:6e3fbc54e6ef4e430b4e53c9c71a1e264642f97ccd3248e56f7275e8aac74273
```

`:next` and `2.3.0-rc.2-nfs.20a31a2` are the same digest today. `:next` is a **moving
alias** — it advances on the next publish from the `nfs/next` channel, and a compose file
pinned to it would silently start running something else between two `docker compose up`
invocations. Swap in `veecode/devportal:next` if that is what you actually want.

The flip side: **this pin is a maintenance obligation, not a permanent fact.** Bump it on
each channel publish. A digest that has fallen behind makes this a stale example, not a
broken one — the old image still runs.

`:latest` belongs to OFS production and is never written by this channel (checked
2026-08-06: still the 2026-06-26 image). `:stable` does not currently exist on this
repository.

## Settings that matter

| Variable | Default | Why it matters |
|---|---|---|
| `NFS_BASE_URL` | `http://localhost:7007` | `app-config.nfs.yaml` feeds it into `app.baseUrl`, `backend.baseUrl` **and** `backend.cors.origin` at once. If it does not match the URL you open in the browser, the symptom is CORS failures, not a wrong link. |
| `ENABLE_STANDARD_MODULE_FEDERATION` | `true` here | The NFS half of the backend switch. False installs the noop frontend-remote service (the OFS path) and dynamic frontend plugins are never announced to the host. |
| `NFS_PORT` | `7007` | Host-side port only. |
| `PG_*` | `devportal`/`devportal`/`backstage` | Consumed by both services, so they cannot drift apart. |

The Postgres role needs **CREATEDB**. Backstage's default `pluginDivisionMode: database`
gives each plugin its own database, so a boot creates `backstage_plugin_catalog`,
`backstage_plugin_auth`, `backstage_plugin_extensions` and so on. The compose file uses the
image's superuser, which already has it; a least-privilege role must be granted CREATEDB
explicitly.

## Installing dynamic plugins

The image default is `dynamic-plugins.nfs.yaml`, which installs nothing. Mount your own at
`/app/dynamic-plugins.yaml` — the entrypoint prefers it when present — and uncomment the
volume line. Example entry:

```yaml
plugins:
  - package: 'oci://quay.io/veecode/backstage:bs_1.53.0!backstage-plugin-kubernetes'
    disabled: false
```

Prefer a digest over `bs_1.53.0` for anything you intend to reproduce later.

## Postgres is not optional here, and that is deliberate

`app-config.production.yaml` ships `better-sqlite3`. The override switches to `pg` because
the NFS entrypoint's fail-closed pre-step is written for it:
`docker/regenerate-extensions-install.js` only acts when `client === 'pg'`, and under
`EXTENSIONS_PRESTEP_FAIL_CLOSED` it refuses the boot with exit 78 when Postgres is
configured but unreachable. On SQLite that path is a no-op, so you would not be exercising
it at all.

Drop the `postgres` service and the override if you want the SQLite single-container form —
the image boots fine that way, you simply lose that guarantee.

## Verified

Against the digest above, on 2026-08-06:

- `/healthcheck` → **HTTP 200**; `GET /` → **HTTP 200** serving `<title>Backstage</title>`
  plus the `/static/*.js` bundles;
- boot log: **0 errors**, and the two NFS markers present —
  `NFS standard module federation: true` and
  `nfs-module-filter: registered frontend remote resolver provider`;
- Postgres carries `backstage_plugin_app`, `_auth`, `_catalog`, `_events`,
  `_dynamic-plugins-info` … which is what proves the `pg` override took effect rather than
  being ignored.

## Helm

`next-charts/veecode-devportal-platform-chart` renders
`image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"` — tag only, no digest
field. To run this image from the chart set `image.tag: next` (or the immutable
`2.3.0-rc.2-nfs.20a31a2`); pinning by digest needs a chart change, since `repo@sha256:…`
does not fit the `repository:tag` template.
