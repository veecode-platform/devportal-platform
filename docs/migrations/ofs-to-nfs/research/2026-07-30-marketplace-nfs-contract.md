# Marketplace contract at the OFS → NFS boundary

**Date:** 2026-07-30  
**Status:** source investigation; no product correction implemented  
**Scope:** `devportal-platform` at `65a7b02`, the local marketplace source at
`devportal-plugins` `5b5c707`, and the local export overlay at
`devportal-plugin-export-overlays` `895d2df`.

## Executive answer

The marketplace is coupled to the installed plugin fleet, but not by importing
each frontend plugin in marketplace code. Its coupling is data- and artifact-
based:

1. the marketplace catalog resolves a plugin to one or more Package entities;
2. each Package supplies a `spec.dynamicArtifact` reference;
3. marketplace installation state is persisted per dynamic-artifact string;
4. the boot installer consumes the resulting YAML entries and their optional
   `pluginConfig`.

That contract does **not** change merely because the host moves from OFS to NFS.
SQLite versus PostgreSQL is selected through Backstage's database service and is
also independent of the frontend system.

What does change is the frontend composition contract. The current marketplace
UI is still exported and configured primarily as an OFS/RHDH dynamic plugin:
`dynamicRoutes`, `menuItems`, `appIcons`, and a legacy plugin root. The source
already contains an NFS `alpha` implementation with page, navigation, API and
translation extensions, but the current `main` package manifests do not export
`./alpha`. A separate local branch contains that export change; no published
artifact or NFS browser result for it was verified here.

The concrete migration risk is therefore the **boot composition boundary**:
the NFS control image has the dynamic loader and Standard Module Federation
plumbing, but its dynamic-plugin inventory is intentionally empty and its
entrypoint does not include the OFS resolver or Postgres state-regeneration
pre-step. The marketplace has not yet been proven end-to-end in that NFS arm.

## Confirmed current contracts

### 1. Marketplace is a three-part runtime surface

The image declares separate marketplace frontend, marketplace backend and
pending-changes bundles. The RHDH extensions backend is disabled because it
shares plugin ID `extensions` with the VeeCode backend:

- [`dynamic-plugins.default.yaml`](../../../../dynamic-plugins.default.yaml#L483-L549)
  declares the three marketplace-related packages, the frontend's legacy
  route/menu config, and the catalog backend module.
- [`presets/recommended.yaml`](../../../../presets/recommended.yaml#L68-L103)
  enables the marketplace frontend, backend and pending-changes packages.
- [`docs/PLUGINS.md`](../../../../docs/PLUGINS.md#L185-L218) records the OCI
  bundle split and the shared `pluginId: "extensions"` boundary.

The catalog backend module is separate from the marketplace UI. It ingests
`Plugin`, `Package` and `PluginCollection` entities from the baked catalog
index, while the marketplace UI is gated by the recommended preset:

- [`Dockerfile`](../../../../Dockerfile#L212-L233) extracts the extensions
  catalog backend module at image build time.
- [`Dockerfile`](../../../../Dockerfile#L244-L263) bakes the versioned
  `plugin-catalog-index` snapshot into `/app/catalog-entities/extensions/`.
- [`app-config.yaml`](../../../../app-config.yaml#L127-L140) allows the
  extensions entity kinds.

Therefore, an NFS frontend migration does not automatically require changing
the catalog ingestion module or the marketplace database. It does require the
NFS app to consume the marketplace frontend as an NFS feature.

### 2. The backend is data-driven, but artifact identity is part of its contract

The marketplace backend is already implemented as a Backstage backend plugin:

- [`devportal-marketplace-backend/src/plugin.ts`](../../../../../devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-backend/src/plugin.ts#L16-L75)
  registers `createBackendPlugin({ pluginId: 'extensions' })`, obtains
  `coreServices.database`, and receives `dynamicPluginsServiceRef` as the
  loaded-plugin provider.
- Its router queries the extensions catalog for plugin/package metadata and
  uses `pluginProvider.plugins()` for the loaded-plugin view:
  `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-backend/src/router.ts:45-66,546-575`.
- `InstallationDataService.getPluginDynamicArtifacts()` resolves a catalog
  plugin to its Package entities and extracts each Package's
  `spec.dynamicArtifact`:
  `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-backend/src/installation/InstallationDataService.ts:121-155`.
- Install, configure and disable routes operate on those artifact references;
  the router also enriches installation entries from catalog
  `appConfigExamples`:
  `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-backend/src/router.ts:232-343,421-542`.

This confirms a real coupling to the installed fleet, but it is not a direct
frontend import graph. The coupling points are the catalog entity graph,
`spec.dynamicArtifact`, `appConfigExamples`, and the dynamic-plugin provider.

### 3. SQLite/Postgres persistence is independent of OFS/NFS

The marketplace storage abstraction tries the Backstage database first and
falls back to file storage:

- `InstallationDataService.create()` obtains a Backstage `DatabaseService`,
  initializes `DatabaseInstallationStorage`, and falls back to
  `FileInstallationStorage` when database initialization fails:
  `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-backend/src/installation/InstallationDataService.ts:34-119`.
- The database migration creates `marketplace_installations` with
  `package_name`, `disabled`, `config_yaml` and `updated_at`:
  `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-backend/migrations/20260323000000_init.js:1-16`.
- DB mutations write the complete package configuration into
  `config_yaml`, then regenerate `extensions-install.yaml`:
  `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-backend/src/installation/DatabaseInstallationStorage.ts:90-137,154-215`.

The platform defaults to SQLite in the shipped production config, with the
database files under `DEVPORTAL_DB_PATH`:
[`app-config.production.yaml`](../../../../app-config.production.yaml#L27-L35).
The documented production alternative is external Postgres, with the
`pg` driver already present and a boot pre-step that reconstructs the YAML
cache from `marketplace_installations`:

- [`docs/adr/014-stateless-persistence-external-db.md`](../../../../docs/adr/014-stateless-persistence-external-db.md#L25-L65)
  defines the database-as-source-of-truth model.
- [`docker/regenerate-extensions-install.js`](../../../../docker/regenerate-extensions-install.js#L3-L33)
  pins the table/columns and gates regeneration on `backend.database.client:
  pg`.
- [`entrypoint.sh`](../../../../entrypoint.sh#L322-L338) invokes that pre-step
  before the Python dynamic-plugin installer.

The implication for CNPG is narrow: CNPG provides the external PostgreSQL
server; it does not introduce an NFS-specific marketplace schema. The schema
and the boot ordering remain the relevant contracts.

### 4. The current NFS image does not yet carry the marketplace boot contract

The NFS image is intentionally a minimal control image:

- [`packages/app-next/src/App.tsx`](../../../../packages/app-next/src/App.tsx#L1-L9)
  installs `dynamicFrontendFeaturesLoader()` through `createApp()`.
- [`app-config.nfs.yaml`](../../../../app-config.nfs.yaml#L1-L9) selects
  `app-next` and restricts static discovery to the catalog capability.
- [`docker/dynamic-plugins.nfs.yaml`](../../../../docker/dynamic-plugins.nfs.yaml#L1-L4)
  is intentionally `plugins: []`.
- [`Dockerfile.nfs`](../../../../Dockerfile.nfs#L81-L111) copies the NFS app,
  production config and generic installer, but does not copy the marketplace
  catalog index, `regenerate-extensions-install.js`, or the OFS entrypoint.
- [`docker/entrypoint.nfs.sh`](../../../../docker/entrypoint.nfs.sh#L1-L38)
  selects the empty NFS inventory, runs the installer, then starts the backend;
  it does not run the preset resolver, marketplace-state pre-step, or catalog
  index refresh/bake path.

This is a confirmed boundary of the current control image, not evidence that
the final NFS image must remain minimal. It means the current Gate 0/1 NFS
result cannot be read as marketplace readiness.

## What changes for the marketplace frontend

### OFS ownership today

The active marketplace configuration supplies the host with the frontend
composition:

```yaml
dynamicPlugins.frontend.devportal.marketplace-frontend:
  appIcons: ...
  dynamicRoutes:
    - path: /marketplace
      importName: DynamicExtensionsPluginRouter
      menuItem: ...
  menuItems: ...
```

That is visible in the image catalog at
[`dynamic-plugins.default.yaml`](../../../../dynamic-plugins.default.yaml#L488-L507)
and in the catalog metadata at
`devportal-plugin-export-overlays/workspaces/marketplace/metadata/devportal-marketplace-frontend-dynamic.yaml:25-43`.
The legacy implementation itself is a `createPlugin` with `createApiFactory`
and `createRoutableExtension` exports:
`devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-frontend/src/plugin.ts:17-100,130-164`.

### NFS ownership in the source tree

The marketplace source already contains the intended NFS feature shape:

- `PageBlueprint` declares `/marketplace` and loads the existing page through
  `compatWrapper`:
  `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-frontend/src/alpha/index.tsx:17-45`.
- `NavItemBlueprint` owns the navigation item and icon:
  `.../src/alpha/index.tsx:47-57`.
- `ApiBlueprint` owns the marketplace and dynamic-plugin-info API factories:
  `.../src/alpha/apis.ts:17-71`.
- A translation module is declared as an NFS frontend module:
  `.../src/alpha/index.tsx:59-74`.
- The default NFS feature is a `createFrontendPlugin` with plugin ID
  `extensions` and the page/nav/API extensions:
  `.../src/alpha/index.tsx:76-89`.

The migration is incomplete in the current `main` package manifests:

- `devportal-marketplace-frontend/package.json:14-24` exports `.` and
  `./package.json`, but not `./alpha`.
- `devportal-marketplace-frontend-dynamic/package.json:16-26` also lacks
  `./alpha`; its `scalprum` block still exposes the legacy `PluginRoot`:
  `.../package.json:44-49`.
- The separate local branch `fix/marketplace-dynamic-alpha-export` at commit
  `5be46b42fcd5fdc1d275c68e676d19f04435940c` adds the two `./alpha` exports
  and re-export files. It is not part of `main` (`5b5c707`) and was not
  published or validated as an OCI artifact in this investigation.

This matches the official migration contract: RHDH's migration guide moves
route, navigation and API ownership from `dynamicPlugins.frontend` YAML into
`PageBlueprint`, navigation extensions and `ApiBlueprint`, with `./alpha` as
the package entrypoint. See the primary sources:

- [RHDH: migrating plugins to the new frontend system](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-plugins-to-new-frontend-system.md)
- [RHDH: migrating configuration to the new frontend system](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-config-to-new-frontend-system.md)
- [Backstage: `@backstage/frontend-dynamic-feature-loader` README](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/README.md)
- [Backstage v1.53 loader source](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/src/loader.ts)

The Backstage loader requires the host to install
`dynamicFrontendFeaturesLoader()`, fetch the backend remotes list, load each
declared exposed module through Module Federation, and accept a default export
whose `$$type` is `FrontendPlugin` or `FrontendModule`. Thus `./alpha` in source
and a dynamic artifact's exposed module/manifest are related but separate
checks.

## What does not automatically change

The following contracts are not frontend-system contracts and should not be
assumed to need redesign solely because the frontend becomes NFS:

- `pluginId: extensions` and the `/api/extensions/*` backend boundary;
- catalog entities and the `spec.dynamicArtifact` lookup;
- the `marketplace_installations` table shape;
- SQLite/Postgres selection through `DatabaseService`;
- permissions on the `extensions` resource;
- the OCI installer and its package-level `disabled`/`pluginConfig` records.

They may still need versioned migration if the artifact selector, package
identity, catalog metadata or boot order changes. That is a data/artifact
migration, not an NFS frontend requirement.

## Inferences about the migration impact

The following are reasoned consequences of the confirmed contracts, not yet
runtime proof:

1. **Artifact identity must remain stable or be migrated.** Database rows are
   keyed by the `spec.dynamicArtifact` value, not by the logical marketplace
   plugin ID. If the NFS publication changes the selector or OCI reference,
   old installation rows will not automatically point at the new package.
2. **Legacy `pluginConfig` cannot remain the source of frontend composition.**
   The current marketplace `appConfigExamples` are valid for OFS, but NFS
   should obtain page/nav/API/translation declarations from the alpha feature.
   The stored YAML may still be needed for installation selection and other
   adopter overrides; it should not be treated as the authoritative location
   of the marketplace UI wiring.
3. **The NFS boot path needs an explicit dynamic-loader configuration anchor.**
   The official loader returns no features when `dynamicPlugins` is absent. If
   an NFS package stops contributing the legacy `dynamicPlugins.frontend` block,
   the host still needs a deliberate way to enable the dynamic-feature loader
   while the backend publishes remotes. This has not been settled in the NFS
   image configuration.
4. **Marketplace UI and pending-changes are separate migration units.**
   The pending-changes package still uses an OFS global-header mount point in
   [`dynamic-plugins.default.yaml`](../../../../dynamic-plugins.default.yaml#L516-L529).
   Migrating the marketplace page alone does not migrate that header surface.
5. **The backend's `loaded-plugins` view is a runtime observation, not frontend
   composition.** The backend receives `dynamicPluginsServiceRef` and can keep
   listing loaded packages while the NFS app separately loads frontend feature
   remotes. These two surfaces should not be conflated in readiness checks.

## Runtime gaps and evidence limits

The repository's frozen control-cohort evidence classified Marketplace as
`requires-port`: the current artifact loaded but exposed only `.` and the
probe found no explicit NFS surface. See
[`2026-07-29-nfs-executable-control-cohort.md`](../evidence/2026-07-29-nfs-executable-control-cohort.md#L140-L162).

The following remain unproven and should stay explicit:

- a current marketplace OCI artifact containing `mf-manifest.json` with the
  NFS feature module and a loadable alpha/default export;
- browser rendering of `/marketplace` in `app-next` with the marketplace
  frontend and backend enabled together;
- marketplace install/disable against SQLite in the NFS image;
- marketplace install/disable against external Postgres/CNPG with an empty
  `/app/data` at boot;
- preservation or migration of existing `marketplace_installations` rows when
  the dynamic-artifact reference changes;
- composition of marketplace, pending-changes, theme and other NFS frontend
  features in the same host;
- whether the final NFS image will reuse the OFS resolver/pre-step, replace it,
  or deliberately narrow marketplace installation to a different control path.

## Bottom line

The alert is valid, but the boundary is narrower than “the marketplace must be
rewritten because NFS uses Postgres.” The marketplace backend/database contract
can remain conceptually intact. The required migration work is to make the
marketplace frontend a real NFS feature and to give the NFS boot path an
explicit, tested composition between catalog metadata, persisted artifact
selections, dynamic-plugin installation, backend remotes, and browser features.

Until that chain is proven, the marketplace should remain classified as an NFS
port/runtime-coverage gap, not as a confirmed plugin defect or a database
compatibility failure.
