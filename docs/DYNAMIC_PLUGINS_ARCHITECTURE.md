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
│     - rewrite the dynamic-plugins shadow `includes:` to chain      │
│       dynamic-plugins.default.resolved.yaml,                       │
│       extensions-install.yaml, and the preset fragments.           │
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

Two kinds of `package:` references:

- `<scope>/<package>@<version>` — NPM, downloaded at boot via
  `npm pack`. Used for a handful of `@veecode-platform/*-dynamic`
  packages still on npm.
- `oci://<registry>/<image>:<tag>!<sub-package>` — OCI artifact,
  pulled via skopeo. `${PLUGIN_REGISTRY}` (default `quay.io/veecode`)
  and `${BACKSTAGE_VERSION}` (from `backstage.json`) in the URL are
  substituted at boot ([`entrypoint.sh`](../entrypoint.sh)).
  The bulk of the inventory uses this form — bundles are published by
  [`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays)
  on a per-Backstage-version basis.

A preset that wants to _enable_ a default-disabled plugin re-emits its
`package:` entry with `disabled: false`. The install script merges
shallow per `package:` key — last-write-wins on the whole entry. So:

```yaml
# presets/recommended.yaml
plugins:
  - package: oci://${PLUGIN_REGISTRY}/rbac:bs_1.49.4!backstage-community-plugin-rbac
    disabled: false
```

…flips RBAC on without restating the (long) `pluginConfig:` block.

### The `package:` exact-match contract

The `package:` field must match the entry already present in
`dynamic-plugins.default.yaml` **exactly** — including the
`oci://…!<selector>` form and any trailing `-dynamic` suffix on the
selector. A mismatch installs the plugin twice under two different
names and the backend crashes on the duplicate registration.

## How OCI bundles are extracted

Each OCI bundle published by
[`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays)
carries one or more **selectors** — distinct dynamic plugins packaged
in the same image. The `!<selector>` suffix on the URL tells
`install-dynamic-plugins.py` which directory inside the bundle to copy
into `/app/dynamic-plugins-root/<name>/`. For example,
`oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}` carries
three selectors (`devportal-marketplace-frontend-dynamic`,
`devportal-marketplace-backend`, `devportal-pending-changes-dynamic`),
each of which the install script extracts independently if listed in
`dynamic-plugins.default.yaml`.

The Dockerfile leaves `/app/dynamic-plugins-root/` empty at build
time — only `mkdir -p` is run. The directory is fully populated by
the install script on every container start.

The one exception is the `cbme` stopgap:
`red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions`
is pulled at *build time* from `quay.io/veecode/extensions:bs_${EXTENSIONS_TAG}`
via skopeo and patched in place — see the [`Dockerfile`](../Dockerfile)
"cbme stopgap" comment block.

## Authoring gotchas

These recur often enough that they belong here, not just in an ADR.
Most apply to the upstream plugin author (in
`devportal-plugin-export-overlays` or wherever the plugin source
lives), since this repo no longer builds plugin bundles itself:

- **`sideEffects: ["**/*.css"]` is required** for any frontend plugin
  whose runtime depends on CSS being bundled. Without it, webpack
  tree-shakes the CSS imports out of the MF bundle and the plugin
  renders unstyled. Backstage's plugin generator does not set this by
  default — author the upstream package with it set.
- **Peer-deps must include React/React-DOM** at the same major the
  host expects (`^18` here). The MF host provides one copy of React
  shared across plugins; a plugin that resolves its own React copy
  produces two React contexts and hooks crash.
- **Theme `id` collisions.** When the theme plugin registers
  `id: light` and `id: dark`, the static
  `@red-hat-developer-hub/backstage-plugin-theme` entries of the same
  ids are dropped (verified in ADR-011 validation #2). Two dynamic
  theme plugins that both register `id: light` produce duplicates in
  the picker and resolve by config-merge order. Hence the design:
  one theme plugin per deployment — to override the VeeCode theme,
  swap `veecode-theme` out of `VEECODE_PRESETS`, don't stack on top.
- **Scalprum's `name` must match the config key.** In the published
  plugin's `package.json` `scalprum.name` field and in
  `dynamic-plugins.default.yaml`'s
  `pluginConfig.dynamicPlugins.frontend.<key>`, the strings must
  match. Mismatch → DynamicRoot loads the manifest but never finds
  the config and skips the plugin silently.

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

`customResolveDynamicPackage` is still required after the OCI swap:
the OCI bundle's `dist-dynamic/package.json` wraps the underlying
plugin via the same `dependencies` pattern the deleted local wrappers
used, so the resolver walks the bundle's `node_modules/` to find the
wrapped package — not the runtime app's `node_modules/`.

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
`dynamic-plugins.yaml` with top-level `plugins:` entries and skips
`VEECODE_PRESETS` entirely is still using the same install pipeline.

## Operator override footgun: always-on entries require their `pluginConfig`

When an operator mounts their own `dynamic-plugins.yaml` (e.g., via a
Kubernetes ConfigMap or a docker-compose bind mount), that file **fully
replaces** the image's `/app/dynamic-plugins.yaml`. The install script
merges per `package:` key across all files in the `includes:` chain,
but the base file itself is replaced, not merged.

This means any `preInstalled: true` entry from the image's original
file that the operator wants to keep must be copied verbatim — **with
its `pluginConfig:` block** — into the operator's file. Omitting the
`pluginConfig:` silently drops any configuration that entry carried.

The most dangerous entry to drop is
`red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions`:

```yaml
- package: red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions
  preInstalled: true
  disabled: false
  pluginConfig:
    extensions:
      directory: /app/catalog-entities/extensions   # ← required for marketplace to ingest
      installation:
        enabled: true
        saveToSingleFile:
          file: ${DEVPORTAL_DB_PATH:-/app/data}/extensions-install.yaml
```

Without `extensions.directory`, the marketplace backend has no source
directory to scan and the "Catalog" tab opens empty even though all the
catalog YAMLs are present under `/app/catalog-entities/extensions/`.

**Rule**: when mounting a custom `dynamic-plugins.yaml`, copy the
always-on `preInstalled: true` block from
[`dynamic-plugins.yaml`](../dynamic-plugins.yaml) in full. The
canonical source is that file — it is the reference for what the image
expects at boot.
