# Backstage Architecture

This doc is a short reference for the Backstage primitives this
project uses and how it wires them. It is not a Backstage tutorial —
when in doubt about a Backstage concept, the upstream docs at
[backstage.io/docs](https://backstage.io/docs) are authoritative.
What this doc gives you is the specific shape of those primitives
here: pinned versions, our overrides, and where to look in code.

## Versions and pins

| Component      | Version                           | Pinned in                                                               |
| -------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Backstage core | **1.49.4**                        | [`backstage.json`](../backstage.json) + root `package.json` resolutions |
| Backstage CLI  | `^0.36.0`                         | root + backend + app `package.json`                                     |
| Node.js        | 20 or 22 (engines); image runs 22 | root `package.json` `engines.node`, Dockerfile `NODE_BASE`              |
| React          | 18.3.1                            | root `package.json` `resolutions`                                       |
| MUI            | 5 (`@mui/material@^5.15.10`)      | `packages/app/package.json`                                             |
| Yarn           | 4.12.0                            | root `package.json` `packageManager`                                    |

A Backstage version bump is one of three independent bumps documented
in [`UPGRADING.md`](UPGRADING.md) (the other two are the UBI base
image and `EXTENSIONS_TAG`).

## Frontend

[`packages/app`](../packages/app/) is a **Scalprum host**, not a
standard Backstage frontend. It uses the legacy frontend system
(`createApp` from `@backstage/app-defaults`) wrapped in
`@scalprum/react-core`'s `ScalprumRoot`, with an RHDH-derived
`DynamicRoot/` shell that discovers and mounts dynamic plugins at
runtime.

### Entry point

[`packages/app/src/App.tsx`](../packages/app/src/App.tsx) is small:

```tsx
const AppRoot = () => (
  <>
    <GlobalStyles styles={{ html: { overflowY: 'hidden' } }} />
    <ScalprumRoot
      apis={apis}
      afterInit={() => import('./components/AppBase')}
      baseFrontendConfig={baseFrontendConfig}
      plugins={staticPlugins}
    />
  </>
);
```

`staticPlugins` is the map of frontend plugins compiled into the
bundle — today, just `@internal/plugin-dynamic-plugins-info`.
Everything else (catalog UI, scaffolder UI, search, techdocs,
notifications, the global header, the homepage, the marketplace, the
theme, …) comes from dynamic plugins discovered at boot.

### The Scalprum shell

`packages/app/src/components/DynamicRoot/` carries the RHDH-derived
machinery. Notable files (line refs from ADR-011):

- `DynamicRoot.tsx:154` — `useThemes()` builds the `themes:` array for
  `createApp`, merging the static
  `@red-hat-developer-hub/backstage-plugin-theme` entries with theme
  providers discovered from dynamic-plugin configs.
- `DynamicRoot.tsx:533-553,600-636` — dynamic theme provider
  discovery. A dynamic theme provider that registers `id: light`
  drops the static `light` entry — that's how `veecode-theme`
  replaces RHDH's static themes (ADR-011 § validation #2).
- `DynamicRoot.tsx:609` — `createApp` call.
- `defaultAppComponents.tsx:33-38` — `SignInPage` is a VeeCode-custom
  component, not dynamic-plugin replaceable through `app.branding`.
  Branding the login screen requires a code change.

### APIs and routes

[`packages/app/src/apis.ts`](../packages/app/src/apis.ts) declares
the API factories the host wires. The Scalprum shell injects
additional API factories from dynamic plugins at load time.

Routes are not declared in a `FlatRoutes` — they come from each
dynamic plugin's `dynamicRoutes:` config (e.g. RBAC contributes
`/rbac`, the marketplace contributes `/marketplace`, tech-radar
contributes `/tech-radar`, the homepage contributes `/`). The host
shell merges these and renders them.

### Styling

MUI v5. A small surface of `@mui/styles/makeStyles` calls remains
in:

- `packages/app/src/components/VeeCodeSignInPage/*.tsx`
- `packages/app/src/components/scaffolder/LayoutCustom.tsx`
- `packages/app/src/components/DynamicRoot/DevportalIcon.tsx`
- `packages/app/src/components/Root/LogoFull.tsx`

These are the legacy makeStyles consumers; migration to `styled()` /
`sx` is opportunistic (see [`MUI_MIGRATION_STATUS.md`](MUI_MIGRATION_STATUS.md)).
`@backstage/ui` (BUI) `^0.13.2` is a direct dep; its base CSS is
imported at `packages/app/src/index.tsx:1`. The VeeCode theme plugin
ships `--bui-*` token overrides as part of its module-federated CSS
(ADR-011 § validation #5).

## Backend

[`packages/backend`](../packages/backend/) is a standard Backstage
backend with the dynamic-plugin feature loader added.

### Entry point

[`packages/backend/src/index.ts`](../packages/backend/src/index.ts):

```ts
const backend = createBackend();

// 1. Default service factories (with our custom logger setup)
defaultServiceFactories.forEach(sf => backend.add(sf));

// 2. Dynamic plugin feature loader (custom wrapper-package resolver)
backend.add(dynamicPluginsFeatureLoader({ schemaLocator, moduleLoader }));

// 3. Disable standard MF service unless explicitly requested
//    (RHDH frontend plugins don't ship standard MF assets)
if (process.env.ENABLE_STANDARD_MODULE_FEDERATION !== 'true') {
  backend.add(noopDynamicPluginsFrontendService);
}

// 4. Health + version + static plugins
backend.add(healthCheckPlugin);
backend.add(versionPlugin);
backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
// catalog plugins, scaffolder plugins, auth, RBAC, search, techdocs, …

backend.start();
```

The full list of static backend plugins is in
[`PLUGINS.md`](PLUGINS.md) § "Static plugins (backend)". The wiring
order matters in three places:

- **Permission/RBAC plugins** load **after** the plugins that define
  permissions (catalog, scaffolder). This is required — the RBAC
  backend discovers permissions at registration time.
- **`@backstage/plugin-auth-backend`** plus a guest provider load
  always; the **consolidated `authProvidersModule`** is gated by
  `ENABLE_AUTH_PROVIDER_MODULE_OVERRIDE !== 'true'` so a customer can
  swap it out for a custom module without forking the backend.
- **MCP plugins are deliberately NOT registered statically**
  ([`packages/backend/src/index.ts:226-229`](../packages/backend/src/index.ts)).
  Adding them here crashes startup with "Plugin 'mcp-actions' is
  already registered" the moment a SaaS instance enables the feature
  via dynamic-plugins.yaml. MCP comes in only as dynamic plugins.

### Custom service factories

`packages/backend/src/defaultServiceFactories.ts` overrides the
default logger to add `meta: { service: 'veecode-devportal-init' }`
and route through Winston. The dynamic-plugin feature loader's
`moduleLoader` carries `customResolveDynamicPackage` that walks
**wrapper** package deps to find the wrapped upstream package —
without this, `import('@backstage-community/plugin-rbac')` inside the
RBAC wrapper would resolve to the host app's `node_modules/`, which
is empty.

### Internal modules

[`packages/backend/src/modules/`](../packages/backend/src/modules/):

- `authProvidersModule` — declares all the OAuth/OIDC providers the
  image supports (GitHub, GitLab, Microsoft, Google, OIDC, GCP IAP,
  OAuth2-Proxy). Which ones are _active_ in a given deployment is
  decided by `auth.providers.*` config (presets set this).
- `healthCheck`, `version` — `/healthcheck` and `/api/version`
  endpoints.
- `pluginIDProviderService` + `rbacDynamicPluginsProvider` — discovers
  permissions exposed by dynamic plugins so RBAC sees them.
- `userSettings` — user-settings backend with our overrides.
- `corporateProxyAgent` — sets up `global-agent` for environments
  behind a corporate proxy.

## Catalog

Locations are declared in
[`app-config.yaml`](../app-config.yaml#L127) (relative paths for
local dev) and overridden in
[`app-config.production.yaml`](../app-config.production.yaml#L41)
(absolute `/app/examples/*` paths for the container). The
`examples/` set ships minimal sample entities — templates, an org
file, sample APIs/Resources/Clusters/techdocs.

Allowed entity kinds:

```yaml
catalog:
  rules:
    - allow:
        [
          Component,
          System,
          API,
          Resource,
          Location,
          User,
          Group,
          Template,
          Plugin,
          Package,
          Collection,
        ]
```

`Plugin`, `Package`, `Collection` are the kinds the marketplace
catalog uses. They are populated by
`catalog-backend-module-extensions` (ships pre-installed; enabled by
the `recommended` preset) ingesting the catalog index image pulled
into `/app/catalog-entities/extensions/` by
[`entrypoint.sh:43-72`](../entrypoint.sh).

## Scaffolder

Standard Backstage scaffolder. Scaffolder backend modules wired in:
GitHub, GitLab, Azure, Azure DevOps, Sonarqube, Jenkins, the
community annotator, the Roadie utils/http-request/aws set, ArgoCD,
and `@veecode-platform/plugin-scaffolder-backend-module-kong`. See
[`PLUGINS.md`](PLUGINS.md).

Templates ship in `examples/template-*` (a Node.js template, an
OpenAPI template, an Azure Node.js template). These are sample data
— operational deployments register their own template locations via
`app-config.local.yaml` or a preset.

## Auth

`auth.providers.guest` is configured to admit guest sessions as
`user:default/admin` with `dangerouslyAllowOutsideDevelopment: true`
([`app-config.yaml`](../app-config.yaml#L99)). This is the dev-time
default; an integration preset (`github`, `keycloak`, `azure`,
`gitlab`, `ldap`) flips `auth.environment` to `production` and wires
the real provider.

OAuth providers are statically registered (see "Internal modules"
above); a deployment activates them by setting
`auth.providers.<name>` in config — usually via a preset's
`appConfig:`.

## Permissions / RBAC

RBAC is enabled by default in this image
([`app-config.yaml`](../app-config.yaml#L156)):

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: ../../rbac-policy.csv
    pluginsWithPermission: [catalog, scaffolder, permission]
    admin:
      users:
        - name: group:default/admins
        - name: group:default/backstage-admins
```

In `app-config.production.yaml`:

```yaml
permission:
  rbac:
    policies-csv-file: ${RBAC_POLICY_PATH:-/app/rbac-policy.csv}
```

So an operator can mount a custom policy at any path and point
`RBAC_POLICY_PATH` at it. The shipped policy is
[`rbac-policy.csv`](../rbac-policy.csv) (admin/developer/viewer
roles) — `rbac-policy-extensions.csv` is appended at image build time
to add marketplace-specific permissions
([`Dockerfile:189-190`](../Dockerfile)). See [`RBAC.md`](RBAC.md).

## Search

Backed by Postgres-based search backend
(`@backstage/plugin-search-backend-module-pg`); collators for catalog
and techdocs. For local dev with SQLite, the search backend uses an
in-memory index.

## TechDocs

Default builder/publisher/generator is `local`
([`app-config.yaml`](../app-config.yaml#L113)). mkdocs runs in the
image (via the Python venv baked into `/opt/python/`). For
production, switch to `googleGcs` / `awsS3` / `azureBlobStorage` —
the storage SDKs are already installed in the backend bundle.

## Kubernetes

`@backstage/plugin-kubernetes-backend` is a static plugin (the
dynamic kubernetes wrapper exists for the frontend tab but the
backend stays static — comment in
[`dynamic-plugins.default.yaml:6-7`](../dynamic-plugins.default.yaml)).
Configuration is per-cluster under `kubernetes.clusterLocatorMethods`;
the `kubernetes` preset wires one cluster via env vars.

## Notifications / Signals

Static. Both `@backstage/plugin-notifications-backend` and
`@backstage/plugin-signals-backend` are loaded; the frontend bundle
includes `@backstage/plugin-notifications` and
`@backstage/plugin-signals` so the bell icon and toast notifications
work without any dynamic plugin involvement.

## What's intentionally not here

- **The New Frontend System** (`@alpha` packages, declarative
  extensions, `frontend-defaults`). Deferred — see ADR-011 § Phase 2.
  We track this against RHDH's Scalprum→NFS path.
- **Standard Module Federation** (Backstage 1.49+ has its own MF
  runtime in `@backstage/frontend-dynamic-feature-loader`).
  `ENABLE_STANDARD_MODULE_FEDERATION` is the flag to flip; defaults
  to the RHDH-style runtime because RHDH frontend dynamic plugins
  don't ship standard MF assets.
- **MCP statically loaded.** As above — registering statically and
  also dynamically causes "already registered" crashes.

## Reading list

- [Backstage Architecture overview](https://backstage.io/docs/overview/architecture-overview)
- [Backstage Backend System](https://backstage.io/docs/backend-system/)
- [Backstage Dynamic Plugins (RHDH-style)](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins)
- [`DYNAMIC_PLUGINS_ARCHITECTURE.md`](DYNAMIC_PLUGINS_ARCHITECTURE.md)
  — our runtime mechanics.
- [`adr/011-frontend-design-system.md`](adr/011-frontend-design-system.md)
  — why the theme is dynamic; deferred NFS migration; ADRs related.
