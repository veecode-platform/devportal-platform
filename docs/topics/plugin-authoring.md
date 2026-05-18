---
name: plugin-authoring
description: Author flow for a new dynamic plugin — the Backstage plugin code, the dynamic export, the conventions that keep it loadable.
type: topic
audience: [plugin-author]
related: [dynamic-plugins, plugin-packaging, theming, presets]
---

# Plugin Authoring

## What this is

This topic covers **the TypeScript you write** when building a new dynamic
plugin for this platform — the Backstage plugin package, its entry-point
exports, the `package.json` constraints that keep Module Federation working,
and the build tool that produces the `dist-scalprum/` artifact.

What it does **not** cover: the OCI packaging, the registry push, the
`dynamic-plugins.default.yaml` entry, or the preset that enables it. That
side lives in `plugin-packaging` (the next topic, not yet written). The
[`theming`](theming.md) topic is a fully worked example of a frontend dynamic
plugin going through exactly this flow.

---

## Decide: frontend, backend, or both

### Frontend plugins

A frontend dynamic plugin is a Module-Federation remote — a JavaScript bundle
served at runtime and mounted into the running app by
[Scalprum](https://github.com/scalprum/scaffolder-root) / the `DynamicRoot`
shell in `packages/app/src/components/DynamicRoot/`. Its presence and
configuration are declared entirely in `dynamic-plugins.default.yaml` under the
plugin's `pluginConfig.dynamicPlugins.frontend.<plugin-id>` block. Common
config keys:

| Key | What it does |
|-----|-------------|
| `mountPoints` | Adds cards or components to a named extension slot |
| `entityTabs` | Declares a new tab on entity pages |
| `dynamicRoutes` | Registers a top-level page route |
| `menuItems` | Adds an item to the sidebar |
| `themes` | Registers theme providers (used by theme plugins) |
| `appIcons` | Registers named icons usable in menu items and routes |

Every named `importName` in those blocks must be exported by name from the
plugin's entry point. The shell resolves them at runtime from the MF remote;
a missing export is a silent non-render, not a build error.

### Backend plugins

A backend dynamic plugin is a CommonJS module consumed by the dynamic-feature-loader
registered in `packages/backend/src/index.ts` (lines 54–95,
`@backstage/backend-dynamic-feature-service`). It exports a
`createBackendPlugin(...)` or `createBackendModule(...)` instance as its
default export. The loader discovers it from `dynamic-plugins.default.yaml`,
resolves it from `dynamic-plugins-root/`, and adds it to the backend at boot —
no code change to `packages/backend/` required.

### Choosing

Most integrations need both: a frontend tab (what the user sees) and a backend
that proxies, fetches, or authenticates against the external service. A pure
theme plugin is frontend-only. A pure catalog provider or scaffolder action
extension is backend-only.

---

## Where the plugin source lives

**Not here.** This repository does not host plugin source for dynamic plugins.
That is the core thesis of ADR-010: the platform's job is image + preset
curation; plugin authoring lives upstream of it.

Write your plugin in:

- **Its own repository** — the standard path. Publish the OCI bundle; reference
  it from `dynamic-plugins.default.yaml` with
  `oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>`.
- **`devportal-plugin-export-overlays`** — the VeeCode-managed workspace for
  first-party plugins. The `veecode-theme` plugin originated here. This is
  the right location for plugins you want pre-published alongside the platform
  image.

Once published, the plugin is a line in `dynamic-plugins.default.yaml` and
zero lines of TypeScript in this repo. See
[ADR-010](../adr/010-unified-image-and-presets.md) for the rationale.

---

## The build tool

Use **`rhdh-cli plugin export`**. Do not use `janus-cli package export-dynamic-plugin`.

`janus-cli` is deprecated. Beyond the deprecation, it has a webpack
configuration bug that silently drops CSS from the MF chunk: a plugin built
with `janus-cli` produces a `dist-scalprum/` where `document.styleSheets` is
empty at runtime — your CSS never executes. The same plugin built with
`rhdh-cli` has `document.styleSheets` populated. This was confirmed
empirically during the `veecode-theme` POC (ADR-011 § validation criterion 5).

The correct build sequence:

```bash
# From your plugin package root
npx rhdh-cli plugin export
```

This runs `tsc` then webpack (MF mode), producing `dist-dynamic/dist-scalprum/`
with:

- `remoteEntry.js` — the MF remote entry the Scalprum host loads
- `plugin-manifest.json` — metadata read by `install-dynamic-plugins.py` at boot

Note: `backstage-cli package build` is **not** needed before `rhdh-cli plugin export`
and currently breaks on CSS imports in this setup. Run `rhdh-cli plugin export`
directly.

---

## Mandatory `package.json` settings

Three settings are non-negotiable. All three exist to prevent silent failures
inside Module Federation — failures that produce no build error but cause broken
CSS or broken theming at runtime.

### `sideEffects`

```json
{
  "sideEffects": ["**/*.css"]
}
```

Without this, webpack's tree-shaker eliminates `import './styles/x.css'`
statements because they have no return value that any other module consumes.
Your CSS silently exits the bundle. Adding `"**/*.css"` to `sideEffects` marks
those imports as intentional side effects that must be preserved.

### React as a peer dependency

```json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

`react` and `react-dom` must be in `peerDependencies`, not `dependencies`.
Module Federation lets the host app provide a single shared React instance to
all remotes. If your plugin bundles its own React copy, you get two React
instances in the same page — hooks break, and the behavior is undefined.

### MUI as a peer dependency

```json
{
  "peerDependencies": {
    "@mui/material": "^5.0.0"
  }
}
```

`@mui/material` must not appear in `dependencies`. For the same reason as React:
the host app's `UnifiedThemeProvider` wraps one MUI instance. If your plugin
carries a duplicate MUI copy, your component-style overrides are applied to a
different MUI instance than the one rendering the host's components — your theme
customizations silently fail.

> These three constraints are documented in ADR-011 § "Lições críticas" with
> empirical evidence from the `veecode-theme` POC. They are not cargo-culted
> from RHDH docs; each has a confirmed failure mode.

---

## Plugin entry points

### Frontend

Your plugin package's main entry must export:

1. A `createPlugin({ id: '<plugin-id>' })` instance (typically the default
   or named `plugin` export) — Scalprum uses this for registration.
2. Every named symbol referenced by `importName` in your
   `dynamic-plugins.default.yaml` entry. For example, if the config has
   `importName: EntityKubernetesContent`, that name must be a named export of
   your plugin index.

Theme plugins additionally export the theme provider functions referenced by
the `themes:` block's `importName` values — see the
[`theming`](theming.md) topic for a complete example.

### Backend

Export a `createBackendPlugin(...)` or `createBackendModule(...)` result as the
module's **default export**. The dynamic-feature-loader in
`packages/backend/src/index.ts` discovers it by convention and adds it to
the backend without any static registration code in this repo.

### The `dist-scalprum/` contract

`rhdh-cli plugin export` writes `dist-dynamic/dist-scalprum/`. That directory
is what `docker/install-dynamic-plugins.py` extracts from the OCI bundle at
boot and places under `/app/dynamic-plugins-root/<plugin-name>/dist-scalprum/`.
The backend dynamic-feature-loader resolves backend plugin CommonJS from
`dist/`, not `dist-scalprum/` — the `schemaLocator` in `packages/backend/src/index.ts`
selects the right subdirectory by `platform` (`node` vs `web`).

---

## Mount points

Frontend plugins surface UI by registering components at named extension slots.
The slots in use by shipped plugins (all verifiable in `dynamic-plugins.default.yaml`):

| Mount point | Where it renders |
|-------------|-----------------|
| `entity.page.<tab>/cards` | Cards in a named entity page tab |
| `entity.page.overview/cards` | Cards in the default Overview tab |
| `application/listener` | Invisible app-level listener (no UI) |
| `application/header` | The global header bar |
| `global.header/component` | Items inside the global header |
| `global.floatingactionbutton/config` | Floating action button entries |

The naming convention is `<scope>/<slot>`. An `entityTabs` entry creates the
tab page container (the `mountPoint` path e.g. `entity.page.kubernetes`); one
or more `mountPoints` entries fill that container with cards.

The canonical definition of these slot names is the RHDH frontend wiring docs
(`redhat-developer/rhdh docs/dynamic-plugins/frontend-plugin-wiring.md`). New
slot names introduced by RHDH are automatically available here because this
platform's `DynamicRoot` shell tracks the RHDH app skeleton.

---

## Local dev loop

Iterating on a plugin without rebuilding the platform image:

1. **Extract the image's plugin root:**
   ```bash
   ./scripts/dev-run.sh dp-extract
   ```
   This copies `/app/dynamic-plugins-root/` from the image into
   `.devrun-cache/dynamic-plugins-root/` on the host. The full working set is
   there: npm-installed plugins, wrappers, the marketplace catalog module.

2. **Drop your build in:**
   ```bash
   cp -r path/to/your-plugin/dist-dynamic/dist-scalprum/ \
     .devrun-cache/dynamic-plugins-root/your-plugin-name/dist-scalprum/
   ```
   You can also edit wrapper packages or swap individual files in place.

3. **Start the container with the cache mounted:**
   ```bash
   ./scripts/dev-run.sh run
   ```
   The cache directory is bind-mounted over `/app/dynamic-plugins-root/` inside
   the container. No `docker build` needed.

4. **After config or file edits, reload without recreating the container:**
   ```bash
   ./scripts/dev-run.sh reload
   ```

This loop covers plugin JS/CSS changes. It does **not** cover changes to
`packages/app/` or `packages/backend/` source — those require `yarn dev-local`.
It also does not cover `dynamic-plugins.yaml` changes (the preset resolver
rewrites that file with `yq -i`, which cannot atomically replace a bind-mounted
file — the baked copy is always used; see `scripts/dev-run.sh` header).

**What's next:** `plugin-packaging` (not yet written) covers the OCI bundle
build, the registry push, and wiring the published artifact into
`dynamic-plugins.default.yaml`.
