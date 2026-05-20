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
([`dynamic-plugins.default.yaml`](../dynamic-plugins.default.yaml)),
gated by the `mcp` / `mcp-chat` presets (see
[`presets/mcp.yaml`](../presets/mcp.yaml) +
[`presets/mcp-chat.yaml`](../presets/mcp-chat.yaml)).

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

## Dynamic plugins — OCI bundles

All dynamic plugins are fetched at boot from OCI images. The reference
shape is `oci://${PLUGIN_REGISTRY}/<workspace>:<tag>!<selector>`;
`${PLUGIN_REGISTRY}` defaults to `quay.io/veecode` and
`${BACKSTAGE_VERSION}` resolves from `backstage.json`. Both are
substituted by `entrypoint.sh`. Bundles are published by
[`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays);
each bundle can carry several selectors that get pulled independently.

| OCI reference                                                                                                                            | Tier / preset    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-frontend-dynamic`                                    | recommended      |
| `oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-backend`                                             | recommended      |
| `oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-pending-changes-dynamic`                                         | recommended      |
| `oci://${PLUGIN_REGISTRY}/rbac:bs_1.49.4!backstage-community-plugin-rbac`                                                                | recommended      |
| `oci://${PLUGIN_REGISTRY}/tech-radar:bs_1.49.4!backstage-community-plugin-tech-radar`                                                    | recommended      |
| `oci://${PLUGIN_REGISTRY}/tech-radar:bs_1.49.4!backstage-community-plugin-tech-radar-backend`                                            | recommended      |
| `oci://${PLUGIN_REGISTRY}/veecode-theme:bs_${BACKSTAGE_VERSION}!veecode-platform-plugin-veecode-theme`                                   | `veecode-theme`  |
| `oci://${PLUGIN_REGISTRY}/backstage:bs_1.49.4!backstage-plugin-kubernetes`                                                               | `kubernetes`     |
| `oci://${PLUGIN_REGISTRY}/azure-devops:bs_1.48.4!backstage-community-plugin-azure-devops`                                                | `azure`          |
| `oci://${PLUGIN_REGISTRY}/azure-devops:bs_1.48.4!backstage-community-plugin-azure-devops-backend`                                        | `azure`          |
| `oci://${PLUGIN_REGISTRY}/jenkins:bs_1.48.4!backstage-community-plugin-jenkins`                                                          | `jenkins`        |
| `oci://${PLUGIN_REGISTRY}/jenkins:bs_1.48.4!backstage-community-plugin-jenkins-backend`                                                  | `jenkins`        |
| `oci://${PLUGIN_REGISTRY}/sonarqube:bs_1.48.4!backstage-community-plugin-sonarqube`                                                      | `sonarqube`      |
| `oci://${PLUGIN_REGISTRY}/sonarqube:bs_1.48.4!backstage-community-plugin-sonarqube-backend`                                              | `sonarqube`      |
| `oci://${PLUGIN_REGISTRY}/scaffolder-backend-module-sonarqube:bs_1.48.4!backstage-community-plugin-scaffolder-backend-module-sonarqube`  | `sonarqube`      |

The marketplace bundle replaces the previous local `dynamic-plugins/`
workspace pieces: `devportal-marketplace-frontend` (VeeCode's fork of
the RHDH Extensions Marketplace UI), `devportal-marketplace-backend`
(its backend pair — shares `pluginId: "extensions"` with the RHDH
backend, so the two can't run simultaneously), and
`devportal-pending-changes` (small header badge).

## Dynamic plugins — NPM (Core / always-on)

A handful of `@veecode-platform/*-dynamic` packages are still
distributed via npm and fetched at boot via `npm pack`. They are
declared with `preInstalled: true` in
[`dynamic-plugins.default.yaml`](../dynamic-plugins.default.yaml) and
ship `disabled: false` — they form the always-on chrome (global
header, homepage, About) that makes the image useful at zero config:

- `veecode-platform-plugin-veecode-homepage-dynamic`
- `veecode-platform-plugin-veecode-global-header-dynamic`
- `veecode-platform-backstage-plugin-about-dynamic`
- `veecode-platform-backstage-plugin-about-backend-dynamic`

## Dynamic plugins — OCI (preset-only)

Some preset-enabled plugins are fetched at boot from OCI registries
(via skopeo); they are not pre-installed. The reference shape:

```
oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>
```

Concrete examples from `dynamic-plugins.default.yaml`:

```
oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-frontend-dynamic
oci://${PLUGIN_REGISTRY}/rbac:bs_1.49.4!backstage-community-plugin-rbac
oci://quay.io/veecode/backstage:bs_${BACKSTAGE_VERSION}!backstage-plugin-mcp-actions-backend
oci://quay.io/veecode/mcp-integrations:bs_${BACKSTAGE_VERSION}!red-hat-developer-hub-backstage-plugin-software-catalog-mcp-extras
```

`${PLUGIN_REGISTRY}` (default `quay.io/veecode`) and
`${BACKSTAGE_VERSION}` (default read from `backstage.json`) are
substituted by [`entrypoint.sh`](../entrypoint.sh) before the install
script runs — search the script for `PLUGIN_REGISTRY` and
`BACKSTAGE_VERSION` to find the substitution blocks. The literal
substitution lets a Backstage bump (or a registry mirror swap) avoid
editing every preset's OCI refs.

The MCP stack (`mcp-actions-backend`, `*-mcp-extras`, `mcp-chat`) is
wired in `dynamic-plugins.default.yaml` with `disabled: true` and is
enabled by two composable presets:

- `mcp` ([`presets/mcp.yaml`](../presets/mcp.yaml)) — flips on
  `mcp-actions-backend` plus the three `*-mcp-extras` tool providers,
  exposing `/api/mcp-actions/v1` for external CLI clients (Claude Code,
  Codex CLI, Cursor) via OAuth/DCR. No required vars; OAuth/DCR config
  lives in the baseline app-config.
- `mcp-chat` ([`presets/mcp-chat.yaml`](../presets/mcp-chat.yaml)) —
  flips on `mcp-chat` + `mcp-chat-backend` (the in-portal AI chat at
  `/mcp-chat`) and layers in `mcpChat.providers` / `mcpServers` /
  `systemPrompt`. Requires `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`,
  `MCP_CHAT_MODEL`. Must compose with `mcp`
  (`VEECODE_PRESETS=mcp,mcp-chat`) — chat-backend talks loopback to the
  MCP server.

The canonical operator docs (token flow, redirect-URI patterns,
toolset list, SaaS card UX) live in the [Confluence "DevPortal MCP — Configuração para ferramentas externas"](https://vertigobr.atlassian.net/wiki/spaces/VPI/pages/3461611522/) page.

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

## Enabling a specific plugin

Presets are the curated path, but an operator sometimes wants a single
plugin on without adopting a whole preset — or a plugin no preset
covers. Three cases.

**In the catalog, and a preset enables it.** Select that preset via
`VEECODE_PRESETS`. This is the recommended path — the preset also
layers the plugin's `appConfig` and declares its `requires.variables`.

**In the catalog, but you want just it, no preset.** Every catalog
entry in `dynamic-plugins.default.yaml` is `disabled: true` by default.
Enable one via the operator override — the top-level `plugins:` list in
`dynamic-plugins.yaml`, merged last so it wins over presets. Bind-mount
your own `dynamic-plugins.yaml` (or edit it in an image-overlay loop)
with:

```yaml
plugins:
  - package: oci://${PLUGIN_REGISTRY}/tech-radar:bs_1.49.4!backstage-community-plugin-tech-radar
    disabled: false
```

The `package:` string must match the catalog entry exactly — copy it
from `dynamic-plugins.default.yaml`. There is no OCI URL to hunt down;
the catalog already declares it. The entry's `pluginConfig` (mount
points, tabs) is inherited from the catalog — you override only
`disabled`.

**Not in the catalog at all.** Add a full entry to the override
`plugins:` list — `package:` (an `oci://` or npm ref), `disabled:
false`, and the `pluginConfig` block the plugin needs. Same shape as a
catalog entry; use the existing entries in `dynamic-plugins.default.yaml`
as templates and see § "Dynamic plugins — OCI bundles" for the ref
format.

> The override also force-*disables*: list a catalog plugin with
> `disabled: true` to turn off something a preset enabled.

## Authoring a new plugin

There are two scaffolds depending on what you want:

### A dynamic plugin (loaded at runtime)

Author the plugin upstream — either in
[`veecode-platform/devportal-plugins`](https://github.com/veecode-platform/devportal-plugins)
(if it's first-party) or in its own repo (for community / wrapper
plugins) — and arrange for it to be exported by
[`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays)
as a layer inside an OCI bundle. Then:

1. Add an entry in `dynamic-plugins.default.yaml` with
   `package: oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>`,
   `disabled: true`, and the right `pluginConfig` for routes/mount
   points.
2. Either create a preset that flips it on (preferred for
   stack-specific features) or include it in `recommended` (only if
   it works with zero configuration and reads as out-of-the-box
   VeeCode — see [`presets/README.md`](../presets/README.md) §
   Tiers).

The `@veecode-platform/*-dynamic` npm packages used for the always-on
chrome follow the same flow but reference `preInstalled: true` and
the `<scope>/<package>` form rather than `oci://`.

### An internal plugin (lives in this repo)

```bash
yarn new --select plugin
```

(That's `backstage-cli new`, aliased from the root.) Scaffolds into
`plugins/<name>/`, picks up the workspaces glob automatically. Import
it from `packages/app/src/App.tsx` or `packages/backend/src/index.ts`
for a static internal plugin. There is no longer a path to publish an
internal plugin dynamically from this repo — for that, author it
upstream and follow the OCI flow above.

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
