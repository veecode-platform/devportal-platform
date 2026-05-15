# Monorepo Structure

`devportal-platform` is a Yarn 4 monorepo. The root workspace and the
`dynamic-plugins/` workspace are two **separate** Yarn projects, each
with its own `yarn.lock` — a detail with operational consequences when
upgrading or building.

## Tooling

- **Yarn 4.12.0** (`packageManager` field in
  [`package.json`](../package.json)), enabled via Corepack. Linker is
  `node-modules` (set by [`.yarnrc.yml`](../.yarnrc.yml); PnP is not
  used).
- **Turbo** for build orchestration ([`turbo.json`](../turbo.json) at
  the root and [`dynamic-plugins/turbo.json`](../dynamic-plugins/turbo.json)).
- **TypeScript ~5.8** at the root.
- **Backstage CLI** (`@backstage/cli`) for package-level operations
  (`start`, `build`, `lint`, `test`).

## Top-level layout

```text
.
├── packages/                 # Root workspace: app + backend
│   ├── app/                  # Frontend (Scalprum host)
│   └── backend/              # Backstage backend
├── plugins/                  # Internal first-party plugins (workspace pkgs)
│   ├── dynamic-plugins-info/
│   ├── dynamic-plugins-info-backend/
│   └── scalprum-backend/
├── dynamic-plugins/          # SEPARATE Yarn workspace (own yarn.lock)
│   ├── wrappers/             # MF wrappers for upstream plugins (15 dirs)
│   ├── packages/             # First-party dynamic plugins
│   ├── downloads/            # NPM-published dynamic plugins (plugins.json)
│   └── _utils/               # Build utilities
├── presets/                  # Preset catalog (YAML) — see presets/README.md
├── examples/                 # Sample catalog entities + templates
├── scripts/                  # build-local-image.sh, dev-run.sh, …
├── python/                   # TechDocs deps (mkdocs requirements)
├── docs/                     # This folder
├── app-config.yaml           # Base config (guest auth, SQLite, branding, CSP)
├── app-config.production.yaml
├── app-config.distro.yaml    # ~10-line distro escape hatch
├── dynamic-plugins.yaml
├── dynamic-plugins.default.yaml
├── rbac-policy.csv
├── rbac-policy-extensions.csv
├── Dockerfile
├── entrypoint.sh
├── backstage.json            # Pinned Backstage version (1.49.4)
├── Makefile                  # `make full` — install + tsc + export + copy
└── package.json
```

## Root workspace

Defined in [`package.json`](../package.json):

```json
"workspaces": { "packages": ["packages/*", "plugins/*"] }
```

So the workspaces under the root `yarn.lock` are:

- `packages/app` — the frontend application. `backstage.role:
frontend`. Hosts Scalprum's `ScalprumRoot` and the RHDH-derived
  `DynamicRoot/` shell that discovers and mounts dynamic plugins.
- `packages/backend` — the Backstage backend. `backstage.role:
backend`. Wires the static plugin set and adds
  `dynamicPluginsFeatureLoader` for runtime plugins.
- `plugins/dynamic-plugins-info` (frontend) + `dynamic-plugins-info-backend`
  — the legacy extensions table; carried for compatibility but its
  routes/sidebar entries are disabled in `dynamic-plugins.default.yaml`
  in favour of the marketplace front/back.
- `plugins/scalprum-backend` — backend support for the dynamic frontend
  shell.

The frontend package's name is literally `app`; the backend is
`backend`. Backstage CLI's `yarn workspace app …` / `yarn workspace
backend …` commands work as expected.

## `dynamic-plugins/` — a second Yarn project

This is **not** a sub-workspace of the root. It has its own
[`package.json`](../dynamic-plugins/package.json),
[`yarn.lock`](../dynamic-plugins/yarn.lock), and
[`backstage.json`](../dynamic-plugins/backstage.json).

```json
"workspaces": {
  "packages": ["_utils", "downloads", "packages/*", "wrappers/*"]
}
```

Why separate: dynamic plugin **wrappers** re-export upstream plugins at
specific versions for Module-Federation packaging. Letting them share
the root's resolution would couple the runtime app's dep tree to the
wrappers' dep tree, which defeats the whole point of dynamic loading.
Two `yarn install`s instead of one is the cost of that decoupling.

The `Makefile` `full` target installs both workspaces, builds the
wrappers, and copies the exported bundles into `dynamic-plugins/dist/`:

```bash
make full
# => yarn install (root)
# => cd dynamic-plugins && yarn install
# => cd dynamic-plugins && yarn clean && yarn tsc && yarn export-dynamic
# => cd dynamic-plugins && yarn copy-dynamic-plugins dist
# => yarn check-dynamic-plugins
```

Subdirectories:

- `wrappers/` — 15 wrapper packages, one per upstream plugin we
  pre-bundle (azure-devops front+back, jenkins front+back, RBAC,
  sonarqube front+back+scaffolder, tech-radar front+back, kubernetes,
  marketplace front+back, pending-changes, veecode-theme). Each wrapper
  is a tiny package that depends on the upstream plugin and runs an
  `export-dynamic` script.
- `packages/` — first-party dynamic plugins authored in this repo:
  `devportal-marketplace-frontend`, `devportal-marketplace-backend`,
  `devportal-pending-changes`.
- `downloads/` — dynamic plugins published to NPM under
  `@veecode-platform/*-dynamic`, fetched by `download-packages.sh`
  during the wrapper build. Pinned in
  [`dynamic-plugins/downloads/plugins.json`](../dynamic-plugins/downloads/plugins.json)
  (currently: veecode-homepage, veecode-global-header, About,
  About-backend).
- `_utils/` — `copy-plugins.js` and other build helpers.

## How wrappers export themselves

A wrapper's `export-dynamic` script is one of two tools:

- **`rhdh-cli plugin export`** — newer, preferred path. Used by
  `veecode-platform-plugin-veecode-theme` (the only remaining local
  frontend wrapper; upstream plugin wrappers for kubernetes, tech-radar,
  and azure-devops are now sourced via OCI).
- **`janus-cli package export-dynamic-plugin --in-place`** — older
  path; still used by most backend wrappers and the marketplace,
  pending-changes wrappers.

Both tools produce a `dist-scalprum/` (frontend) or `dist-dynamic/`
(backend) directory with a Module-Federation remote entry + manifest
that the install script copies into `/app/dynamic-plugins-root/<name>/`.
ADR-011 § "Validation criteria" documents _when_ `rhdh-cli` is
preferred (frontend plugins that need `sideEffects: ["**/*.css"]` for
CSS module-federation bundling — `backstage-cli package build` breaks
on that import).

## Runtime layout (inside the image)

For comparison, here is what the workspace layout becomes inside the
built image:

```text
/app/
├── packages/backend/         # Backend bundle, runs node packages/backend
├── dynamic-plugins/dist/     # Built wrapper bundles (build output)
├── dynamic-plugins-root/     # Active plugin set (Dockerfile-copied + boot-resolved)
├── presets/                  # Same shape as repo's presets/
├── catalog-entities/extensions/  # Marketplace catalog YAMLs
├── app-config.yaml
├── app-config.production.yaml
├── app-config.distro.yaml
├── dynamic-plugins.yaml
├── dynamic-plugins.default.yaml
├── rbac-policy.csv           # ↳ rbac-policy-extensions.csv appended at build
├── install-dynamic-plugins.py
├── install-dynamic-plugins.sh
└── entrypoint.sh
```

`dynamic-plugins-root/` is the only one of these the boot script
mutates. `entrypoint.sh` writes preset fragments next to the configs
(`app-config.preset-<name>.yaml`, `preset-<name>-plugins.yaml`), and
`install-dynamic-plugins.sh` (re)generates
`dynamic-plugins-root/app-config.dynamic-plugins.yaml` on every boot.

## Where things go when you add something

| You are adding                                              | It goes in                               | Then                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new internal Backstage plugin (lives in this repo)        | `plugins/<name>/`                        | Add to root `package.json` workspaces via the existing `plugins/*` glob; import in `packages/app/src/App.tsx` or `packages/backend/src/index.ts`. |
| A wrapper for an upstream plugin (Module-Federation export) | `dynamic-plugins/wrappers/<name>/`       | Register in `Dockerfile`'s pre-install loop; add `package: <name>` entry in `dynamic-plugins.default.yaml`.                                       |
| An NPM-published dynamic plugin to bake into the image      | `dynamic-plugins/downloads/plugins.json` | Re-run `make full`.                                                                                                                               |
| A preset                                                    | `presets/<name>.yaml`                    | Validate via `yq eval . presets/<name>.yaml`; document in `presets/README.md`'s "Available presets" table.                                        |

For the "new plugin" case, the [`PLUGINS.md`](PLUGINS.md) doc has the
walkthroughs.
