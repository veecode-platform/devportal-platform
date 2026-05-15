# Development Guide

This guide covers running and developing `devportal-platform` locally.
There are two distinct inner loops:

1. **Node dev loop** — `yarn dev-local` runs the frontend on `:3000`
   and the backend on `:7007` directly from the workspace. Best for
   editing `packages/app/*` and `packages/backend/*` code.
2. **Image overlay loop** — `scripts/dev-run.sh` boots the built
   container and bind-mounts the repo's `presets/`, `entrypoint.sh`,
   `app-config.*.yaml`, and `install-dynamic-plugins.py` over the
   baked-in copies, so a `docker restart` (~30s) picks up changes to
   any of those without a full image rebuild (~25–35 min on WSL). Best
   for editing presets, the entrypoint, or iterating on a dynamic
   plugin.

Pick the loop that matches what you are changing.

## Prerequisites

| Tool                  | Version                                    | Why                                                                                 |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Node.js               | 20 or 22                                   | `engines.node` in [`package.json`](../package.json). Image runs on UBI10 Node 22.   |
| Yarn                  | 4.12.0                                     | Enabled via Corepack. `corepack enable && corepack prepare yarn@4.12.0 --activate`. |
| Python 3.12           | for TechDocs (mkdocs)                      | Optional locally; required only if you want TechDocs to render.                     |
| Docker                | recent                                     | For the overlay loop.                                                               |
| `yq` (mikefarah, v4+) | for editing `dynamic-plugins.yaml` by hand | Optional. The image ships `yq` 4.53.2.                                              |

WSL users: the frontend build needs **at least 6 GB of V8 heap**
(`NODE_OPTIONS=--max-old-space-size=6144` is set automatically inside
the image, but not in the host workspace). For the image build,
`--memory=4g --memory-swap=6g` is required to avoid OOM kills — see
[`scripts/build-local-image.sh`](../scripts/build-local-image.sh).

## First-time setup

```bash
# 1. Install workspace deps + build dynamic plugin wrappers + copy to dist
make full
# Equivalent: yarn install && cd dynamic-plugins && yarn install && \
#             yarn clean && yarn tsc && yarn export-dynamic && \
#             yarn copy-dynamic-plugins dist && cd .. && yarn check-dynamic-plugins
#
# Or use the shortcut:
yarn init-local
```

`make full` does double-duty: it installs both the root and the
`dynamic-plugins/` workspaces (they each have their own `yarn.lock` —
[`MONOREPO_STRUCTURE.md`](MONOREPO_STRUCTURE.md)) and exports the
dynamic-plugin bundles to `dynamic-plugins/dist/`.

For TechDocs locally:

```bash
python3 -m venv ./venv
source venv/bin/activate
pip install -r python/requirements.txt
```

Keep the venv activated when running the backend, otherwise mkdocs
shells out to `python` from `$PATH`.

## Node dev loop — `yarn dev-local`

```bash
yarn dev-local
# => Backend on http://localhost:7007
# => Frontend on http://localhost:3000
```

The `dev-local` script (in [`package.json`](../package.json)) launches
turbo with three `--config` flags, in this order:

1. `app-config.yaml` — base distribution defaults (guest auth, SQLite
   in-memory, branding, CSP).
2. `app-config.local.yaml` — your local overrides (gitignored; create
   it as a sibling of `app-config.yaml`).
3. `app-config.dynamic-plugins.yaml` — historical placeholder; in
   container runs the equivalent file is generated under
   `dynamic-plugins-root/`, but `yarn dev-local` does not use the
   image's dynamic plugins. Frontend dynamic plugins (Scalprum) are
   loaded but populated only with the static set wired in
   `packages/app/src/App.tsx`.

Other scripts you'll use:

```bash
yarn dev                    # like dev-local but without app-config.local.yaml
yarn debug-local            # with --inspect on the backend
LOG_LEVEL=debug yarn dev-local

yarn tsc                    # type-check everything (turbo)
yarn lint:check             # lint everything (turbo)
yarn test                   # run jest (turbo)
yarn prettier:check         # check formatting

# Single package:
yarn workspace backend start
yarn workspace app test
yarn workspace @internal/plugin-dynamic-plugins-info test
```

### Guest auth and identity

`app-config.yaml` ships with `auth.providers.guest.userEntityRef:
user:default/admin` and `dangerouslyAllowOutsideDevelopment: true`.
Every guest session lands as `user:default/admin` — that's the user
present in [`examples/org.yaml`](../examples/org.yaml) wired to the
admin role via [`rbac-policy.csv`](../rbac-policy.csv). For real
identity, run the image with one of the integration presets (`github`,
`keycloak`, `gitlab`, `azure`, `ldap`) — see
[`presets/README.md`](../presets/README.md).

### Hitting the backend directly

```bash
USER_TOKEN="$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.backstageIdentity.token')"

curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:7007/api/catalog/entities
```

Useful for inspecting catalog state, scaffolder tasks, or RBAC policy
without going through the UI.

## Image overlay loop — `scripts/dev-run.sh`

When you change a preset, the entrypoint, an `app-config.*.yaml`, or a
dynamic plugin's built artifact, the Node dev loop won't reflect it —
they live in the image. The overlay script avoids the 25–35 minute
rebuild by bind-mounting the repo's copies over the image's:

```bash
# (re)create the container, wait for /healthcheck
./scripts/dev-run.sh run

# after editing a mounted file (preset, entrypoint, app-config.*.yaml,
# install-dynamic-plugins.py, dynamic-plugins.default.yaml):
./scripts/dev-run.sh reload

# follow logs
./scripts/dev-run.sh logs

# stop & remove
./scripts/dev-run.sh stop
```

The script runs on `:7007` to match the image's baked
`app.baseUrl`/`backend.baseUrl` (running on a different port hits CORS
in the bundled frontend), and applies `--memory=2g --memory-swap=3g`
by default — enough for a single instance, not enough to rebuild
inside the container.

Forwarded env vars (anything you set in your shell): `VEECODE_PRESETS`,
`VEECODE_APP_CONFIG`, `BACKSTAGE_VERSION`, and any `AUTH_*`,
`GITHUB_*`, `GITLAB_*`, `AZURE_*`, `KEYCLOAK_*`, `LDAP_*`, `KONG_*`,
`SONAR*`, `JENKINS_*`, `K8S_*`. So a real-world preset-driven local
boot looks like:

```bash
export GITHUB_PAT=ghp_…
export GITHUB_ORG=my-org
VEECODE_PRESETS=recommended,veecode-theme,github ./scripts/dev-run.sh run
```

### Dynamic plugin overlay

`dev-run.sh dp-extract` copies the image's
`/app/dynamic-plugins-root/` into `./.devrun-cache/dynamic-plugins-root/`,
makes it writable (chmod a+rwX — required, because docker cp preserves
the in-image uid which the container's `default` user can't write
through), and then `dev-run.sh run` bind-mounts that directory over
`/app/dynamic-plugins-root/`. You can:

- Drop in a freshly exported plugin dir (e.g. from `dynamic-plugins/dist/`
  after `cd dynamic-plugins && yarn build && yarn export-dynamic`).
- Edit a wrapper's `dist-scalprum/` bundle in-place to test a small
  change without a full export.
- Run `cd dynamic-plugins && yarn build && yarn export-dynamic && yarn
copy-dynamic-plugins "$REPO/.devrun-cache/dynamic-plugins-root"` to
  refresh the overlay.

Then `./scripts/dev-run.sh reload` to pick it up.

### What the overlay does NOT cover

The script's header documents this and it bites if you forget:

- **`packages/app/*` and `packages/backend/*` source.** Use `yarn
dev-local` for those.
- **The Dockerfile itself, dependency manifests, or `package.json`.**
  Rebuild the image.
- **`dynamic-plugins.yaml`** — bind-mount excluded on purpose. The
  preset resolver in [`entrypoint.sh:152-156`](../entrypoint.sh) edits
  it in place with `yq -i`, and `yq` can't atomically replace a
  single-file bind mount, so preset fragments never get included.
- **The `cbme` `/alpha → main` patch** to
  `catalog-backend-module-extensions/dist/module.cjs.js`. The script
  re-applies it automatically on `run`, but only when the overlay
  doesn't already carry a patched copy (Dockerfile:217-264 has the full
  context).

## Configuration: presets vs raw

There is **no `VEECODE_PROFILE` system** in this repo. The
`devportal-base` mechanism that selected one of `github` / `keycloak`
/ `azure` / `ldap` / `gitlab` config files via a single env var was
replaced by the preset catalog ([`presets/README.md`](../presets/README.md)).
Presets compose:

```bash
VEECODE_PRESETS=recommended,veecode-theme,github
```

For local dev with `yarn dev-local` (Node loop, no entrypoint),
presets do not apply — you assemble the config yourself via
`app-config.local.yaml`. For local dev with `./scripts/dev-run.sh`
(container loop), presets work exactly as in production.

[`CONFIGURATION_GUIDE.md`](CONFIGURATION_GUIDE.md) has the precedence
rules and the layering details.

## Adding a new local override

Create `app-config.local.yaml` next to `app-config.yaml`:

```yaml
auth:
  providers:
    github:
      development:
        clientId: ${AUTH_GITHUB_CLIENT_ID}
        clientSecret: ${AUTH_GITHUB_CLIENT_SECRET}

integrations:
  github:
    - host: github.com
      token: ${GITHUB_PAT}
```

It is gitignored. `yarn dev-local` reads it as the second `--config`.
Inside the image, it would also be the last regular config layer
before `app-config.dynamic-plugins.yaml` and `app-config.saas.yaml`
([`entrypoint.sh:218-227`](../entrypoint.sh) has the full precedence
list).

## Tests

```bash
yarn test           # turbo run test — everything (uses jest)
yarn test:all       # backstage-cli repo test --coverage
yarn test:e2e       # playwright
yarn workspace backend test
```

[Testing strategy](../CLAUDE.md#testing-strategy) is "test as you go,
don't backfill": new code gets a unit test, bug fixes get a regression
test, refactors get a test before the refactor, and read-only access
to old code does not block on adding tests. Backend APIs and internal
plugins are the priority areas; frontend component tests against
DynamicRoot/Scalprum and full e2e are deliberately deprioritised.

## Troubleshooting

**`yarn install` fails complaining about Corepack** — make sure
Corepack is enabled and Yarn is set to 4.12.0:

```bash
npm i -g corepack
corepack enable
corepack prepare yarn@4.12.0 --activate
yarn config set nodeLinker node-modules
```

**Frontend build OOMs at "JavaScript heap out of memory"** — set
`NODE_OPTIONS=--max-old-space-size=6144` before `yarn build` or `yarn
dev-local`. The image's builder stage already does this.

**Marketplace "Catalog" tab is empty in `dev-run.sh`** — the
`catalog-backend-module-extensions` `/alpha` import patch may not have
applied. Check `./scripts/dev-run.sh logs` for the
`"marketplace: mounting patched catalog-backend-module-extensions
module"` line; if absent, the image you are running predates the
stopgap or `skopeo` couldn't pull the OCI extensions image. The full
patch context is in [`Dockerfile:217-264`](../Dockerfile).

**A preset's required env var is missing** — the entrypoint exits 78
with a clear message (`Preset "github" requires GITHUB_PAT. …`). Check
[`presets/<name>.yaml`](../presets/) for the full required-variables
list.

**Backend can't find `python` for TechDocs** — activate the venv
(`source venv/bin/activate`) before `yarn dev-local`.

**TypeScript errors after a dependency change** — `yarn install &&
yarn tsc`. If incremental builds get confused, `rm -rf .turbo && yarn
tsc`.

## Useful workspace commands

```bash
yarn workspaces list                       # show every workspace
yarn workspace backend why <pkg>           # trace dependency origin
yarn workspace app build                   # build a single package
yarn dlx <command>                         # one-off (uses yarn cache)
backstage-cli new --select plugin          # scaffold a new internal plugin
```

`yarn new` (alias of `backstage-cli new`) scaffolds an internal plugin
into `plugins/<name>/` and wires it into the workspaces glob
automatically.
