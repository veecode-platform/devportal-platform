# Monorepo Structure

`devportal-platform` is a Yarn 4 monorepo with a single root workspace.
Dynamic plugins are no longer built from a sibling workspace — they are
fetched as OCI bundles at boot from
[`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays).

## Tooling

- **Yarn 4.12.0** (`packageManager` field in
  [`package.json`](../package.json)), enabled via Corepack. Linker is
  `node-modules` (set by [`.yarnrc.yml`](../.yarnrc.yml); PnP is not
  used).
- **Turbo** for build orchestration ([`turbo.json`](../turbo.json)).
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
├── backstage.json            # Pinned Backstage version (1.53.0)
├── Makefile                  # Release targets only
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

## Dynamic plugins — OCI bundles

Dynamic plugins are no longer built from a host-side workspace. Each
plugin is published as a layer inside an OCI bundle by
[`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays)
and referenced from
[`dynamic-plugins.default.yaml`](../dynamic-plugins.default.yaml) via
`oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>`.
At boot, [`docker/install-dynamic-plugins.py`](../docker/install-dynamic-plugins.py)
pulls the bundle via `skopeo`, extracts the requested selector into
`/app/dynamic-plugins-root/<name>/`, and merges the plugin's
`pluginConfig:` into the generated runtime
`app-config.dynamic-plugins.yaml`.

`${PLUGIN_REGISTRY}` defaults to `quay.io/veecode` and
`${BACKSTAGE_VERSION}` resolves from
[`backstage.json`](../backstage.json); both are substituted by
[`entrypoint.sh`](../entrypoint.sh) before the install script runs.

## Runtime layout (inside the image)

```text
/app/
├── packages/backend/         # Backend bundle, runs node packages/backend
├── dynamic-plugins-root/     # Active plugin set, populated at boot from OCI
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

`dynamic-plugins-root/` starts empty (the Dockerfile only `mkdir`s it)
and is fully populated at boot. `entrypoint.sh` writes preset fragments
next to the configs (`app-config.preset-<name>.yaml`,
`preset-<name>-plugins.yaml`), and `install-dynamic-plugins.sh`
(re)generates `dynamic-plugins-root/app-config.dynamic-plugins.yaml`
on every boot.

## Where things go when you add something

| You are adding                                              | It goes in                                       | Then                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new internal Backstage plugin (lives in this repo)        | `plugins/<name>/`                                | Add to root `package.json` workspaces via the existing `plugins/*` glob; import in `packages/app/src/App.tsx` or `packages/backend/src/index.ts`. |
| A new dynamic plugin (consumed via OCI)                     | `veecode-platform/devportal-plugin-export-overlays` | Publish a new workspace bundle there, then add a `package: oci://…!<selector>` entry to `dynamic-plugins.default.yaml`.                          |
| A preset                                                    | `presets/<name>.yaml`                            | Validate via `yq eval . presets/<name>.yaml`; document in `presets/README.md`'s "Available presets" table.                                        |

For the "new plugin" case, the [`PLUGINS.md`](PLUGINS.md) doc has the
walkthroughs.
