# Dynamic Plugins Architecture

Dynamic plugins are the way `devportal-platform` ships extension
points without forking the image. They are loaded at boot from
`/app/dynamic-plugins-root/` by an RHDH-derived install script
(`install-dynamic-plugins.py` + `install-dynamic-plugins.sh`), and
served at runtime via Webpack Module Federation (frontend) and
Backstage's `backend-dynamic-feature-service` (backend).

This doc explains the runtime mechanism, the build pipeline, and the
authoring gotchas that recur. For the _what plugins ship_ layer, see
[`PLUGINS.md`](PLUGINS.md). For the _which ones are enabled in a
given deployment_ layer, see [`presets/README.md`](../presets/README.md).

## The runtime, in one diagram

```text
┌─ Boot (entrypoint.sh) ─────────────────────────────────────────────┐
│  1. Resolve VEECODE_PRESETS:                                       │
│     - validate `requires.variables` (exit 78 if missing)           │
│     - write each preset's `plugins:` into preset-<n>-plugins.yaml │
│     - write each preset's `appConfig:` into                        │
│       app-config.preset-<n>.yaml                                   │
│     - rewrite dynamic-plugins.yaml's `includes:` to chain          │
│       dynamic-plugins.default.yaml, extensions-install.yaml,       │
│       and the preset fragments.                                    │
│  2. Resolve ${BACKSTAGE_VERSION} in any OCI refs (sed in place).   │
│  3. Run install-dynamic-plugins.sh /app/dynamic-plugins-root       │
│     ↓                                                              │
│     install-dynamic-plugins.py:                                    │
│       - for each entry, fetch (npm / OCI via skopeo) or copy       │
│         the bundle into /app/dynamic-plugins-root/<plugin-name>/   │
│       - merge each plugin's `pluginConfig:` shallow-per-key into a │
│         generated /app/dynamic-plugins-root/app-config.dynamic-    │
│         plugins.yaml                                               │
│  4. Assemble --config chain (precedence: distro → preset(s) →      │
│     local → dynamic-plugins → saas) and exec node packages/backend.│
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ Backstage runtime ────────────────────────────────────────────────┐
│  Backend (packages/backend/src/index.ts):                          │
│    backend.add(dynamicPluginsFeatureLoader({                       │
│      schemaLocator, moduleLoader (CommonJSModuleLoader with        │
│      customResolveDynamicPackage that walks wrapper deps)          │
│    }))                                                             │
│    + static plugins (catalog, scaffolder, auth, RBAC, search, …)   │
│                                                                    │
│  Frontend (packages/app):                                          │
│    ScalprumRoot → DynamicRoot discovers entries from               │
│    app-config's dynamicPlugins.frontend.* and loads their MF       │
│    remote entries from /api/scalprum/<scope>/…                     │
│    served by @internal/plugin-scalprum-backend.                    │
└────────────────────────────────────────────────────────────────────┘
```

The pieces are upstream-compatible: this is the same Scalprum +
Module-Federation pattern RHDH ships, with our preset resolver in
front of it.

## The plugin descriptor: `dynamic-plugins.default.yaml`

[`dynamic-plugins.default.yaml`](../dynamic-plugins.default.yaml) is
the master list of plugins the install script can act on. Each entry:

```yaml
- package: <reference> # path, npm name, or OCI ref
  disabled: true|false
  preInstalled: true|false # set true when /app/dynamic-plugins-root/<name>/ is baked in
  pluginConfig:
    dynamicPlugins:
      frontend|backend:
        <scalprum-or-plugin-id>:
          # routes, mount points, menu items, translations, etc.
```

Three kinds of `package:` references:

- `./dynamic-plugins/dist/<name>` — local path, valid for plugins
  built into the image (the wrappers).
- `<scope>/<package>@<version>` — NPM, downloaded at boot via
  `npm pack`.
- `oci://<registry>/<image>:<tag>!<sub-package>` — OCI artifact,
  pulled via skopeo. `${BACKSTAGE_VERSION}` in the tag is substituted
  at boot ([`entrypoint.sh:176-196`](../entrypoint.sh)).

For the entries that ship pre-installed in the image
(`preInstalled: true`), the Dockerfile already copied the bundle from
`dynamic-plugins/dist/<name>/` into
`/app/dynamic-plugins-root/<name>/` at build time
([`Dockerfile:203-221`](../Dockerfile)). The install script then
**skips fetching** and only merges the `pluginConfig:` into the
generated `app-config.dynamic-plugins.yaml`.

A preset that wants to _enable_ a preinstalled plugin re-emits its
`package:` entry with `disabled: false`. The install script merges
shallow per `package:` key — last-write-wins on the whole entry. So:

```yaml
# presets/recommended.yaml
plugins:
  - package: backstage-community-plugin-rbac
    disabled: false
```

…flips RBAC on without restating the (long) `pluginConfig:` block.

### The `package:` exact-match contract

The `package:` field must match the entry already present in
`dynamic-plugins.default.yaml` **exactly** — including any trailing
`-dynamic` suffix that the build tool appends.
[`presets/SCHEMA.md`](../presets/SCHEMA.md) calls this out: e.g. the
marketplace backend is `devportal-marketplace-backend-dynamic-dynamic`
(the wrapper is named `…-backend-dynamic` and `janus-cli` appends
`-dynamic` again on export). A mismatch installs the plugin twice
under two different names and the backend crashes on the duplicate
registration.

## Pre-installed plugins (baked into the image)

The Dockerfile pre-installs these into `/app/dynamic-plugins-root/`
([`Dockerfile:203-221`](../Dockerfile)):

```
veecode-platform-plugin-veecode-global-header-dynamic
veecode-platform-plugin-veecode-homepage-dynamic
veecode-platform-plugin-veecode-theme-dynamic
veecode-platform-backstage-plugin-about-backend-dynamic
veecode-platform-backstage-plugin-about-dynamic
devportal-marketplace-backend-dynamic-dynamic
devportal-pending-changes-dynamic
devportal-marketplace-frontend-dynamic
```

Plus the `red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions`
pulled from `quay.io/veecode/extensions:bs_${EXTENSIONS_TAG}` via
skopeo ([`Dockerfile:223-270`](../Dockerfile)).

These are present in `dynamic-plugins-root/` from boot zero; the
preset only needs to flip `disabled: false` (and supply
`appConfig:` for the wiring).

## The build pipeline: wrappers and `dynamic-plugins/`

[`dynamic-plugins/`](../dynamic-plugins/) is a separate Yarn workspace
(see [`MONOREPO_STRUCTURE.md`](MONOREPO_STRUCTURE.md)). It builds the
Module-Federation bundles consumed at runtime.

```bash
cd dynamic-plugins
yarn install                          # installs the workspace
yarn build                            # tsc each wrapper
yarn export-dynamic                   # MF export per wrapper
yarn copy-dynamic-plugins ../dynamic-plugins-root  # publish for image
```

Each wrapper under `dynamic-plugins/wrappers/<name>/` is a small
package:

```json
{
  "name": "veecode-platform-plugin-veecode-theme",
  "main": "src/index.ts",
  "backstage": {
    "role": "frontend-plugin",
    "pluginId": "veecode-theme"
  },
  "sideEffects": ["**/*.css"],
  "scripts": {
    "build": "backstage-cli package build",
    "export-dynamic": "rhdh-cli plugin export"
  },
  "scalprum": {
    "name": "veecode-platform.plugin-veecode-theme",
    "exposedModules": { "PluginRoot": "./src/index.ts" }
  }
}
```

Two CLI tools are in use across the workspace; the choice is
per-wrapper:

| Tool                                                 | Used by                                                                                                                                                                              | When to pick                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rhdh-cli plugin export`                             | `veecode-platform-plugin-veecode-theme` (the only remaining local frontend wrapper — upstream plugin wrappers for kubernetes, tech-radar, azure-devops are now sourced via OCI) | Frontend wrappers that need `sideEffects: ["**/*.css"]` for module-federated CSS. `backstage-cli package build` currently breaks on the CSS import (ADR-011 § validation #1). |
| `janus-cli package export-dynamic-plugin --in-place` | RBAC, jenkins, sonarqube, marketplace front+back, pending-changes, azure-devops backend, sonarqube-backend, jenkins-backend, scaffolder-backend-module-sonarqube                     | The older path. Stable; produces a `dist-dynamic/` that the install script understands. Most backend wrappers use this.                                                       |

Both produce module-federation artifacts the runtime can load — the
shape of the output (`dist-scalprum/` for frontend MF,
`dist-dynamic/` for backend Node modules) is the contract, not the
tool.

## Authoring gotchas

Captured from ADR-011 § "Lições críticas" and the wrappers we have
working today. These recur often enough that they belong in this doc,
not just an ADR:

- **`sideEffects: ["**/\*.css"]` is required\*\* for any frontend plugin
  whose runtime depends on CSS being bundled. Without it, webpack
  tree-shakes the CSS imports out of the MF bundle and the plugin
  renders unstyled. Backstage's plugin generator does not set this by
  default — add it manually.
- **Peer-deps must include React/React-DOM** at the same major the
  host expects (`^18` here). The MF host provides one copy of React
  shared across plugins; a plugin that resolves its own React copy
  produces two React contexts and hooks crash.
- **Use `rhdh-cli plugin export`, not `backstage-cli package build`**,
  for frontend wrappers with CSS. The Backstage CLI's
  `package build` runs Rollup, which doesn't handle the CSS
  side-effect declaration the way the wrapper needs.
- **Theme `id` collisions.** When the theme plugin registers
  `id: light` and `id: dark`, the static
  `@red-hat-developer-hub/backstage-plugin-theme` entries of the same
  ids are dropped (verified in ADR-011 validation #2). Two dynamic
  theme plugins that both register `id: light` produce duplicates in
  the picker and resolve by config-merge order. Hence the design:
  one theme plugin per deployment — to override the VeeCode theme,
  swap `veecode-theme` out of `VEECODE_PRESETS`, don't stack on top.
- **The exported artifact name is the wrapper directory + `-dynamic`**.
  `dynamic-plugins/wrappers/veecode-platform-plugin-veecode-theme/`
  exports to
  `dynamic-plugins/dist/veecode-platform-plugin-veecode-theme-dynamic/`,
  and the `dynamic-plugins.default.yaml` entry uses that suffix
  literally. The marketplace-backend wrapper directory is
  `devportal-marketplace-backend-dynamic` and exports to
  `devportal-marketplace-backend-dynamic-dynamic` (double suffix —
  see "exact-match contract" above).
- **Scalprum's `name` must match the config key.** In
  `package.json`'s `scalprum.name` field and in
  `dynamic-plugins.default.yaml`'s `pluginConfig.dynamicPlugins.frontend.<key>`,
  the strings must match. Mismatch → DynamicRoot loads the manifest
  but never finds the config and skips the plugin silently.

## Backend dynamic plugin loading

[`packages/backend/src/index.ts:54-105`](../packages/backend/src/index.ts)
registers the feature loader:

```ts
backend.add(
  dynamicPluginsFeatureLoader({
    schemaLocator(pluginPackage) {
      const platform = PackageRoles.getRoleInfo(
        pluginPackage.manifest.backstage.role,
      ).platform;
      return path.join(
        platform === 'node' ? 'dist' : 'dist-scalprum',
        'configSchema.json',
      );
    },
    moduleLoader: logger => new CommonJSModuleLoader({
      logger,
      // Walk wrapper package's dependencies to resolve the wrapped package.
      customResolveDynamicPackage(_, searchedPackageName, scannedPluginManifests) { … },
    }),
  }),
);
```

The custom resolver is what makes wrapper packages work. A wrapper
like `dynamic-plugins/wrappers/devportal-marketplace-frontend-dynamic/`
depends on `devportal-marketplace-frontend workspace:^`; the resolver
walks the wrapper's own `node_modules/` to find the wrapped package,
not the runtime app's `node_modules/`.

## Frontend dynamic plugin loading

[`packages/app/src/App.tsx`](../packages/app/src/App.tsx) builds a
`baseFrontendConfig` for the always-on internal plugin
(`internal.plugin-dynamic-plugins-info`) and hands it to
`ScalprumRoot`. The real dynamic-plugin discovery happens inside
`packages/app/src/components/DynamicRoot/` (the RHDH-derived shell).
On every page load:

1. The app fetches the runtime `app-config` (via the standard
   Backstage app-backend endpoint).
2. `DynamicRoot` reads `dynamicPlugins.frontend.*` from that config.
3. For each entry, Scalprum loads the MF remote entry from
   `/api/scalprum/<scope>/…` (served by `@internal/plugin-scalprum-backend`).
4. The plugin's `mountPoints`, `dynamicRoutes`, `menuItems`,
   `appIcons`, `themes`, `translationResources` are read from the
   config and the corresponding `importName` from the plugin's exposed
   module is mounted at the right host point.

`ENABLE_STANDARD_MODULE_FEDERATION=true` would switch to the upstream
MF runtime; by default the RHDH-style runtime is used
([`packages/backend/src/index.ts:107-127`](../packages/backend/src/index.ts)).

## Translations

The legacy `i18n` system from upstream Backstage is wired through
`@red-hat-developer-hub/backstage-plugin-translations-backend`
(backend) and `@red-hat-developer-hub/backstage-plugin-translations`
(frontend). [`app-config.yaml`](../app-config.yaml) exposes `en` and
`pt` locales. Dynamic plugins contribute translation resources via
`pluginConfig.dynamicPlugins.frontend.<name>.translationResources`;
see [`DYNAMIC_PLUGIN_TRANSLATIONS.md`](DYNAMIC_PLUGIN_TRANSLATIONS.md)
for the full author-side workflow.

## Where presets fit in

Presets are configuration over this system, not a separate runtime.
A preset's `plugins:` block is a list of `dynamic-plugins.yaml` entries
that the entrypoint chains into the install script's input. A
preset's `appConfig:` block is a Backstage config fragment loaded via
`--config`.

The preset _catalog_ (which presets ship, what they require, which
plugins they enable) is the operational interface this image presents
to its operators. The dynamic plugin _mechanism_ is upstream Backstage
behaviour with the RHDH packaging conventions. Both layers can be used
independently: a raw-Backstage operator who builds their own
`dynamic-plugins.yaml` and skips `VEECODE_PRESETS` entirely is still
using the same install pipeline.
