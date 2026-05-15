# Plugins

This doc is about the _plugin inventory_ in `devportal-platform`:
what ships, where it lives, and which preset enables it. For the
_mechanism_ by which plugins are loaded at runtime, read
[`DYNAMIC_PLUGINS_ARCHITECTURE.md`](DYNAMIC_PLUGINS_ARCHITECTURE.md)
first.

## Three plugin kinds

1. **Static plugins** — compiled into `packages/app` (frontend) and
   `packages/backend` (backend). Always on. Can't be turned off
   without a code change.
2. **Internal plugins** (`@internal/*`) — workspace packages under
   [`plugins/`](../plugins/). Built as part of the root workspace,
   imported statically by `packages/app` or `packages/backend`.
3. **Dynamic plugins** — loaded at runtime from
   `/app/dynamic-plugins-root/`. Either pre-installed (baked into the
   image at build time) or fetched at boot (NPM / OCI). Toggled
   per-deployment via `dynamic-plugins.yaml` entries — the typical
   path is a preset that flips `disabled: false`.

The whole point of the dynamic-plugin layer is keeping the image
_generic_. Anything that varies by customer (auth provider, catalog
provider, CI/CD integration) lives in a dynamic plugin enabled by a
preset, not in the static set.

## Static plugins (backend)

Compiled into `packages/backend` via
[`packages/backend/src/index.ts`](../packages/backend/src/index.ts).
The list, as it stands today:

**Core**

- `@backstage/plugin-app-backend`
- `@backstage/plugin-proxy-backend`

**Catalog**

- `@backstage/plugin-catalog-backend`
- `@backstage/plugin-catalog-backend-module-scaffolder-entity-model`
- `@backstage/plugin-catalog-backend-module-logs`
- `@backstage/plugin-catalog-backend-module-openapi`
- `@backstage/plugin-catalog-backend-module-github`
  (+ `-github-org`)
- `@backstage/plugin-catalog-backend-module-msgraph`
- `@backstage/plugin-catalog-backend-module-azure`
- `@backstage-community/plugin-catalog-backend-module-azure-devops-annotator-processor`
- `@backstage-community/plugin-catalog-backend-module-keycloak`
- `@backstage/plugin-catalog-backend-module-ldap`
- `@backstage/plugin-catalog-backend-module-gitlab`
  (+ `-gitlab-org`)
- `@backstage/plugin-catalog-backend-module-incremental-ingestion`

**Scaffolder**

- `@backstage/plugin-scaffolder-backend`
- `@backstage/plugin-scaffolder-backend-module-github`
- `@backstage/plugin-scaffolder-backend-module-azure`
  (+ `-azure-devops`)
- `@backstage/plugin-scaffolder-backend-module-gitlab`
- `@backstage/plugin-scaffolder-backend-module-notifications`
- `@backstage-community/plugin-scaffolder-backend-module-annotator`
- `@backstage-community/plugin-scaffolder-backend-module-sonarqube`
- `@backstage-community/plugin-scaffolder-backend-module-jenkins`
- `@backstage/plugin-scaffolder-backend-module-azure-devops`
- `@roadiehq/scaffolder-backend-module-utils`
- `@roadiehq/scaffolder-backend-module-http-request`
- `@roadiehq/scaffolder-backend-module-aws`
- `@roadiehq/scaffolder-backend-argocd`
- `@veecode-platform/plugin-scaffolder-backend-module-kong`

**Auth**

- `@backstage/plugin-auth-backend` (+ guest provider)
- A consolidated `authProvidersModule` (gated by
  `ENABLE_AUTH_PROVIDER_MODULE_OVERRIDE`) wires GitHub, GitLab, Azure,
  Google, OIDC, GCP IAP, OAuth2-Proxy and Microsoft providers from
  the `@backstage/plugin-auth-backend-module-*-provider` packages.
  Which providers are _active_ in a given deployment is selected by
  preset (see `presets/<integration>.yaml`'s `appConfig.auth`).

**Permissions / RBAC**

- `@backstage/plugin-permission-backend`
- `@backstage-community/plugin-rbac-backend`
- A `pluginIDProviderService` + `rbacDynamicPluginsProvider` so the
  RBAC backend discovers permissions exposed by dynamic plugins too.

**Search / TechDocs / Kubernetes / Notifications**

- `@backstage/plugin-search-backend` + `-module-pg`, `-module-catalog`,
  `-module-techdocs`.
- `@backstage/plugin-techdocs-backend`.
- `@backstage/plugin-kubernetes-backend`.
- `@backstage/plugin-notifications-backend`.
- `@backstage/plugin-signals-backend`.
- `@backstage/plugin-events-backend`.

**Internal**

- `@internal/plugin-dynamic-plugins-info-backend` (the legacy
  extensions API; its frontend is disabled in
  `dynamic-plugins.default.yaml` in favour of the marketplace).
- `@internal/plugin-scalprum-backend`.
- `@red-hat-developer-hub/backstage-plugin-translations-backend`.

Notable absent: **MCP plugins are not registered statically**.
[`packages/backend/src/index.ts:226-229`](../packages/backend/src/index.ts)
explains — registering them here would crash startup with "Plugin
'mcp-actions' is already registered" the moment a SaaS instance
turns the feature on. MCP comes in only as dynamic plugins
([`dynamic-plugins.default.yaml`](../dynamic-plugins.default.yaml), all
`disabled: true`).

## Static plugins (frontend)

[`packages/app`](../packages/app/) wires very little statically — the
shell is intentionally thin, since most UI surfaces come from dynamic
plugins.

[`packages/app/src/App.tsx`](../packages/app/src/App.tsx) wires:

- `@internal/plugin-dynamic-plugins-info` — the only static plugin
  with a frontend mount (its routes/menu are disabled in
  `dynamic-plugins.default.yaml` so the marketplace plugin replaces
  the UI surface).

The bulk of the static frontend deps in
[`packages/app/package.json`](../packages/app/package.json) are
Backstage core (`@backstage/plugin-catalog`, `-scaffolder`, `-search`,
`-techdocs`, `-org`, `-user-settings`, `-api-docs`, `-home`,
`-signals`, `-notifications`, `-explore`, `-permission-react`,
`-catalog-graph`, `-catalog-import`, `-catalog-unprocessed-entities`,
`-techdocs-react`, `-techdocs-module-addons-contrib`) — pages that
render given the right routes/mount-points are pushed by dynamic
plugins.

## Internal plugins

[`plugins/`](../plugins/):

- **`dynamic-plugins-info`** (frontend) + **`dynamic-plugins-info-backend`**
  — the legacy extensions table. Carried for compatibility; its
  routes and sidebar item are disabled in
  `dynamic-plugins.default.yaml` (the marketplace replaces the UI).
- **`scalprum-backend`** — serves Scalprum's MF asset endpoints
  (`/api/scalprum/<scope>/*`) for the dynamic frontend plugin shell.

These live in the root workspace; they are imported by the static
backend/frontend, not loaded dynamically.

## Dynamic plugins — wrappers

15 wrapper packages under
[`dynamic-plugins/wrappers/`](../dynamic-plugins/wrappers/), each
re-exporting an upstream plugin as a Module-Federation bundle:

| Wrapper directory                                                        | Wraps                                                 | Tier / preset   |
| ------------------------------------------------------------------------ | ----------------------------------------------------- | --------------- |
| `backstage-community-plugin-rbac`                                        | `@backstage-community/plugin-rbac`                    | recommended     |
| `backstage-community-plugin-tech-radar`                                  | `@backstage-community/plugin-tech-radar`              | recommended     |
| `backstage-community-plugin-tech-radar-backend-dynamic`                  | `@backstage-community/plugin-tech-radar-backend`      | recommended     |
| `backstage-community-plugin-azure-devops`                                | `@backstage-community/plugin-azure-devops` (frontend) | `azure`         |
| `backstage-community-plugin-azure-devops-backend-dynamic`                | `@backstage-community/plugin-azure-devops-backend`    | `azure`         |
| `backstage-community-plugin-jenkins`                                     | `@backstage-community/plugin-jenkins` (frontend)      | `jenkins`       |
| `backstage-community-plugin-jenkins-backend-dynamic`                     | `@backstage-community/plugin-jenkins-backend`         | `jenkins`       |
| `backstage-community-plugin-sonarqube`                                   | `@backstage-community/plugin-sonarqube` (frontend)    | `sonarqube`     |
| `backstage-community-plugin-sonarqube-backend-dynamic`                   | `@backstage-community/plugin-sonarqube-backend`       | `sonarqube`     |
| `backstage-community-plugin-scaffolder-backend-module-sonarqube-dynamic` | sonarqube scaffolder backend module                   | `sonarqube`     |
| `backstage-plugin-kubernetes`                                            | `@backstage/plugin-kubernetes` (frontend)             | `kubernetes`    |
| `devportal-marketplace-frontend-dynamic`                                 | local `packages/devportal-marketplace-frontend`       | recommended     |
| `devportal-marketplace-backend-dynamic`                                  | local `packages/devportal-marketplace-backend`        | recommended     |
| `devportal-pending-changes-dynamic`                                      | local `packages/devportal-pending-changes`            | recommended     |
| `veecode-platform-plugin-veecode-theme`                                  | first-party theme provider                            | `veecode-theme` |

The wrappers exist for one reason: turning a static-plugin import
chain into an MF-loadable bundle. Most don't add any code beyond a
tiny `src/index.ts` re-export.

Built artifacts land in `dynamic-plugins/dist/<name>-dynamic/` and
get copied (preinstalled) into `/app/dynamic-plugins-root/` at image
build time.

## Dynamic plugins — first-party (`dynamic-plugins/packages/`)

- **`devportal-marketplace-frontend`** — VeeCode's fork of the RHDH
  Extensions Marketplace UI. Replaces the disabled
  `red-hat-developer-hub-backstage-plugin-extensions` frontend.
- **`devportal-marketplace-backend`** — backend pair of the above.
  **Critical**: shares `pluginId: "extensions"` with the RHDH backend,
  so the two can't run simultaneously. The
  `dynamic-plugins.default.yaml` keeps the RHDH backend
  `disabled: true` and ours `disabled: true` (recommended-tier — the
  `recommended` preset flips ours on).
- **`devportal-pending-changes`** — small header badge component
  pulled in by the global header.

## Dynamic plugins — downloads

[`dynamic-plugins/downloads/plugins.json`](../dynamic-plugins/downloads/plugins.json)
lists NPM-published `@veecode-platform/*` plugins fetched during the
wrapper build:

- `@veecode-platform/plugin-veecode-homepage-dynamic`
- `@veecode-platform/plugin-veecode-global-header-dynamic`
- `@veecode-platform/backstage-plugin-about-dynamic`
- `@veecode-platform/backstage-plugin-about-backend-dynamic`

These are pre-installed and **Core** (`disabled: false` from the
start) — they ship the global header, homepage, About page. The
image is never useful without them, so they are not gated by a
preset.

## Dynamic plugins — OCI (preset-only)

Some preset-enabled plugins are fetched at boot from OCI registries
(via skopeo); they are not pre-installed. The reference shape:

```
oci://quay.io/veecode/backstage:bs_${BACKSTAGE_VERSION}!backstage-plugin-mcp-actions-backend
oci://quay.io/veecode/mcp-integrations:bs_${BACKSTAGE_VERSION}!<name>
oci://quay.io/veecode/mcp-chat:bs_${BACKSTAGE_VERSION}!<name>
oci://ghcr.io/veecode-platform/devportal-plugin-export-overlays/<plugin>:bs_${BACKSTAGE_VERSION}__<rev>!<name>
```

`${BACKSTAGE_VERSION}` is the variable substituted by `entrypoint.sh`
at boot ([`entrypoint.sh:176-196`](../entrypoint.sh)); the literal
substitution lets a Backstage bump avoid editing every preset's OCI
refs.

The MCP stack (`mcp-actions-backend`, `*-mcp-extras`, `mcp-chat`) is
wired in `dynamic-plugins.default.yaml` with `disabled: true` and is
**not** currently enabled by any preset — a future preset will
flip them on once they're stable on the image's Backstage version.

## What ships enabled by default

With **no preset** (`VEECODE_PRESETS` unset):

- Global header, homepage, About (front+back), dynamic-plugins-info
  (with routes/menu suppressed).
- Theme: falls back to the static
  `@red-hat-developer-hub/backstage-plugin-theme` `light`/`dark`
  (the VeeCode theme plugin is `disabled: true`).
- No marketplace, no RBAC UI, no tech-radar, no pending-changes
  badge, no integration plugins.

With **`VEECODE_PRESETS=recommended`** ([`presets/recommended.yaml`](../presets/recommended.yaml)):

- All of the above, plus the marketplace (front+back),
  `catalog-backend-module-extensions`, RBAC (UI + backend), tech-radar
  (with sample data), pending-changes badge.
- Still no integration plugins, no theme override.

With **`VEECODE_PRESETS=recommended,veecode-theme`**:

- Adds the VeeCode dark/light themes (replace the static fallbacks
  by id collision — see ADR-011).

With **`VEECODE_PRESETS=recommended,veecode-theme,<integration>`**:

- Adds the integration's plugins (frontend tabs, backend modules) and
  config; the integration's `requires.variables` must be set in the
  env or the boot fails fast.

## Authoring a new plugin

There are three different scaffolds depending on what you want:

### A wrapper for an existing upstream plugin

```bash
cd dynamic-plugins
yarn new-wrapper           # interactive; creates wrappers/<name>/
```

The script ([`dynamic-plugins/scripts/new-wrapper.mjs`](../dynamic-plugins/scripts/new-wrapper.mjs))
scaffolds a wrapper with the right `package.json` (`backstage.role`,
`scalprum.name`, `sideEffects`, `export-dynamic` script). Pick
`rhdh-cli plugin export` if it's a frontend wrapper with CSS;
otherwise `janus-cli` is the safe default
([`DYNAMIC_PLUGINS_ARCHITECTURE.md`](DYNAMIC_PLUGINS_ARCHITECTURE.md)
§ "Authoring gotchas").

Then:

1. Add an entry in `dynamic-plugins.default.yaml` with
   `package: <wrapper-name>-dynamic`, `disabled: true`,
   `preInstalled: true` (if you intend to bake it in) and the right
   `pluginConfig` for routes/mount-points.
2. Add the wrapper name to the pre-install loop in
   [`Dockerfile:203-221`](../Dockerfile).
3. Build: `cd dynamic-plugins && yarn install && yarn build && yarn
export-dynamic`.
4. Either create a preset that flips it on (preferred for stack-specific
   features) or include it in `recommended` (only if it works with
   zero configuration and reads as out-of-the-box VeeCode —
   `presets/README.md` § Tiers).

### An internal plugin (lives in this repo)

```bash
yarn new --select plugin
```

(That's `backstage-cli new`, aliased from the root.) Scaffolds into
`plugins/<name>/`, picks up the workspaces glob automatically. For a
_static_ internal plugin, import it from `packages/app/src/App.tsx`
or `packages/backend/src/index.ts`. For a _dynamic_ internal plugin,
mirror the wrapper pattern: build it under `dynamic-plugins/packages/`,
not `plugins/`, so it shares the dynamic-plugin packaging pipeline.

### A first-party plugin (published, not in this repo)

Author it in [`veecode-platform/devportal-plugins`](https://github.com/veecode-platform/devportal-plugins),
publish under `@veecode-platform/*-dynamic`, then add to
[`dynamic-plugins/downloads/plugins.json`](../dynamic-plugins/downloads/plugins.json)
and reference it as a `package:` in `dynamic-plugins.default.yaml`.

## Reading list

- [`DYNAMIC_PLUGINS_ARCHITECTURE.md`](DYNAMIC_PLUGINS_ARCHITECTURE.md)
  — runtime loading mechanics and authoring gotchas.
- [`presets/README.md`](../presets/README.md) — preset tiers, the
  recommended-vs-integration admission test, the curation boundary.
- [`adr/011-frontend-design-system.md`](adr/011-frontend-design-system.md)
  — why the theme is a dynamic plugin enabled by a preset (not baked
  into recommended).
- [`DYNAMIC_PLUGIN_TRANSLATIONS.md`](DYNAMIC_PLUGIN_TRANSLATIONS.md)
  — wiring locale-aware menu items in dynamic plugins.
