# OFS → NFS: initial migration investigation

**Date:** 2026-07-28
**Status:** exploratory; no migration code started
**Scope:** `veecode-platform/devportal-platform` at the Backstage 1.53 line, with the
VeeCode Drydock as the future runtime-verification gate.

## Executive verdict

The Backstage 1.49.4 → 1.53.0 bump and the OFS → NFS cutover are separate axes.
The current platform is still an Old Frontend System (OFS) application. Backstage's
official migration guide describes `core-compat-api` as a bridge for a conventional
`packages/app` migration, but this repository does not have that shape: its app entry
is a Scalprum host and its `createApp` call is created lazily inside the dynamic-plugin
loader.

The working direction is therefore **a second NFS app arm**, not an attempt to wrap
the existing `DynamicRoot` in `convertLegacyAppRoot`:

```text
legacy arm: packages/app      → Scalprum / OFS      → current fleet
NFS arm:    packages/app-next → standard MF / NFS   → migrated subset
```

Both arms should coexist long enough for controlled A/B verification. The legacy arm
remains the safe default while the NFS arm is built around the stock RHDH `app-next`
shape and VeeCode-specific extensions are ported deliberately.

This is a working architecture hypothesis, not yet a validated implementation.

## Evidence from the current platform

### The current app is not the upstream default OFS template

- [`packages/app/src/App.tsx`](../../packages/app/src/App.tsx) renders
  `ScalprumRoot`, loads `dynamicPlugins` from runtime configuration, fetches the
  Scalprum manifest from `/api/scalprum/plugins`, and supplies `AppBase` only after
  dynamic initialization.
- [`packages/app/src/components/DynamicRoot/ScalprumRoot.tsx`](../../packages/app/src/components/DynamicRoot/ScalprumRoot.tsx)
  owns config loading, the Scalprum provider, remote manifest URL rewriting, and the
  dynamic-root context.
- [`packages/app/src/components/DynamicRoot/DynamicRoot.tsx`](../../packages/app/src/components/DynamicRoot/DynamicRoot.tsx)
  imports the legacy `createApp` from `@backstage/app-defaults` and calls it only
  after extracting remote routes, APIs, icons, themes, translations, providers and
  entity mount points. The call is around line 609, not in the top-level app entry.
- [`packages/app/src/components/AppBase/AppBase.tsx`](../../packages/app/src/components/AppBase/AppBase.tsx)
  contains the custom route tree, entity tabs, catalog columns, scaffolder layout,
  TechDocs Mermaid addon, search/settings customizations, consent route and dynamic
  route insertion.

The official `convertLegacyAppRoot(rootElement, options)` API accepts a concrete
legacy React root element and returns NFS frontend features. That contract does not
automatically bridge a runtime-created `ScalprumRoot` whose app instance and root
tree are assembled after remote configuration has loaded.

### The repository already has part of the NFS transport plumbing

[`packages/backend/src/index.ts`](../../packages/backend/src/index.ts) gates standard
Module Federation on `ENABLE_STANDARD_MODULE_FEDERATION`. This is useful groundwork,
but it does not provide an NFS frontend bundle: the image currently contains the
legacy `app` package only, and `packages/app/package.json` has no direct
`@backstage/frontend-defaults` or `app-next` implementation.

The current dynamic configuration is heavily OFS/RHDH-loader-shaped. The default
catalog contains `entityTabs`, `mountPoints`, `dynamicRoutes`, `appIcons`,
`translationResources` and `themes`; the active config also includes those patterns.
Those keys are not merely renamed in NFS. Their ownership moves from operator YAML
to plugin-declared extensions, with `app.extensions` used for adopter overrides.

The Yarn graph confirms that some NFS APIs are already present only transitively and
in multiple versions: `@backstage/frontend-defaults`, `@backstage/core-compat-api`
and `@backstage/plugin-app-react` resolve in `yarn.lock`, but none is a direct NFS
app integration in `packages/app/package.json`. There is also no
`@backstage/frontend-dynamic-feature-loader` entry in the current lockfile. This is
not yet a dependency-resolution blocker, but it is an integration boundary that the
app-next spike must settle rather than assuming the current Scalprum loader can be
reused.

## What the official migration material says

### Backstage core compatibility

Backstage exposes `convertLegacyAppOptions`, `convertLegacyAppRoot`,
`convertLegacyPlugin` and `compatWrapper` in `@backstage/core-compat-api`.

- `convertLegacyAppRoot` converts a legacy app element tree into NFS features.
- `convertLegacyPlugin` still requires the caller to provide the extensions that
  should be exposed; it does not infer the complete plugin contract.
- `compatWrapper` is a React compatibility boundary for legacy/NFS API contexts.
- Backstage explicitly positions the plugin conversion helpers for third-party
  plugins; plugins we own should be migrated directly when possible.

The official app guide has a five-step hybrid phase, but its starting assumptions are
the standard app template: top-level `createApp`, legacy app options, and a root
element passed to `app.createRoot`. Those assumptions are the mismatch with the
VeeCode shell, not evidence that the compatibility package is broken.

### RHDH plugin migration

The RHDH guide gives a more relevant three-phase model for dynamic plugins:

1. Add `src/alpha.tsx` with `createFrontendPlugin` and blueprint extensions, export
   `./alpha`, and retain the legacy export.
2. Move the wiring currently expressed in `dynamicPlugins.frontend.<package>` into
   plugin-owned extensions; remove redundant YAML only after validation.
3. Validate in an NFS app, using `app.packages`/`app.extensions` for discovery and
   adopter-specific overrides.

The configuration guide explicitly says that RHDH still ships the legacy `app` by
default; `app-next` is a separate NFS package selected with
`APP_CONFIG_app_packageName=app-next`, while
`ENABLE_STANDARD_MODULE_FEDERATION=true` enables the backend asset path. That is a
distro/app-shell transition, not a consequence of changing the Backstage minor
version alone.

The main configuration mappings relevant to this repository are:

| Current OFS/RHDH wiring | NFS direction |
|---|---|
| `dynamicRoutes` + `menuItems` | `PageBlueprint` / `SubPageBlueprint` |
| `apiFactories` | `ApiBlueprint` owned by the plugin |
| `mountPoints` entity cards/tabs | `EntityCardBlueprint` / `EntityContentBlueprint` |
| `routeBindings` | `app.routes.bindings` |
| `themes` | `ThemeBlueprint` |
| `translationResources` | translation extensions |
| `appIcons` | page/icon bundle extensions or `config.icon` |
| `scaffolderFieldExtensions` | plugin-owned extensions, normally auto-discovered |
| `config.layout` | no direct `app.extensions` equivalent; treat as a visual-diff concern |

## Initial platform scope

The internal source audit in the vault estimated the Gate-3-critical platform work at
roughly **1–1.5 weeks**, subject to revalidation against the current branches. The
shape of that estimate is more useful than the number:

### Platform shell

- Add/build `packages/app-next` as a separate frontend package, based on the RHDH NFS
  shell rather than cloning the 705-line `DynamicRoot`.
- Preserve the current `packages/app` as the legacy arm during migration.
- Port VeeCode-owned behavior that the stock shell does not provide: sign-in and
  consent, translations, custom catalog behavior, scaffolder additions, TechDocs
  Mermaid, custom APIs and any required app-root wrappers.
- Treat the custom `Root`/sidebar as a decision, not an automatic port. The current
  `Root.tsx` contains substantial code but only a small VeeCode delta according to
  the internal audit; accepting stock NFS navigation may be cheaper than recreating
  the old shell.

### Brand and own plugins

- `veecode-theme` is gating for a visually valid NFS arm. It is currently wired as a
  dynamic `themes:` provider and needs a `ThemeBlueprint`/`/alpha` export.
- The VeeCode `global-header` fork should not be assumed to need a new port. The
  internal audit found an upstream RHDH global-header release with NFS blueprints;
  adopting it in the NFS arm is likely cheaper than porting the fork.
- That creates a known divergent A/B pair: legacy uses the VeeCode fork, NFS uses
  upstream. Drydock must label that difference explicitly so a visual delta is not
  misreported as an NFS regression.

### Fleet tail

The prior audit counted upstream `/alpha` entries, not our fork readiness. That
distinction matters. The current plan should not treat the upstream percentage as
the VeeCode fleet's migration percentage. Forks and VeeCode-owned plugins need a
direct package/source audit before they are classified as NFS-ready.

The third-party tail can remain on the legacy arm during the first NFS proof. The
future Drydock migration automation can add a dual-export `/alpha` entry non-destructively, then
prove it against the NFS app. It should not become a prerequisite for bringing up
the first NFS shell.

## Drydock coupling

The current Drydock verifier is correctly OFS-oriented for the current image: its
config generator emits Scalprum `mountPoints`/`dynamicRoutes` and the 1.53 runtime is
the legacy app. The missing capability is not “make today's run NFS”; it is to add an
NFS arm and make coverage boundaries explicit.

The first Drydock change needed for the migration is classification of an NFS-only
plugin as **outside the current OFS coverage**, instead of allowing it to disappear
into a weak or probe-gap verdict. Once the NFS app exists, the harness can run the
same package/profile through both arms and compare route attachment plus browser
behavior against exact image/plugin digests.

The RHDH plugin-workspace rule confirms the operational pattern: keep separate legacy
and NFS start commands, select with `APP_MODE`, keep artifact directories separate,
and run both Playwright suites in CI.

## Proposed next investigation slice

Before porting the fleet, the safest next slice is a **platform shell spike**:

1. Re-verify the current RHDH `app-next` package shape and exact 1.53-compatible
   dependency resolutions.
2. Create a disposable NFS app package with only the stock shell plus one VeeCode
   owned extension; keep the legacy app untouched.
3. Boot it behind explicit `app.packageName`/standard-MF configuration and record
   the first failure boundary.
4. Add the Drydock NFS-only classification and a minimal dual-arm browser probe.
5. Only then port `veecode-theme`, global-header choice, sign-in/consent and the
   remaining custom routes in dependency order.

This gives us an early answer to “does our image boot in NFS mode?” without mixing
that question with the full 95-package fleet migration.

## Sources

### Official primary sources

- [Backstage — Migrating Apps](https://backstage.io/docs/frontend-system/building-apps/migrating/)
- [`convertLegacyAppRoot` API](https://backstage.io/api/next/functions/_backstage_core-compat-api.convertLegacyAppRoot.html)
- [`convertLegacyPlugin` API](https://backstage.io/api/next/functions/_backstage_core-compat-api.convertLegacyPlugin.html)
- [Backstage — Converting 3rd-party plugins](https://backstage.io/docs/frontend-system/building-apps/plugin-conversion)
- [Backstage v1.53.0 release notes](https://backstage.io/docs/releases/v1.53.0/)
- [RHDH — Migrating plugins to the new frontend system](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-plugins-to-new-frontend-system.md)
- [RHDH — Migrating configuration to the new frontend system](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-config-to-new-frontend-system.md)
- [RHDH plugins — legacy/NFS E2E rule](https://github.com/redhat-developer/rhdh-plugins/blob/main/.cursor/rules/legacy-nfs-migration-e2e.mdc)

### Internal evidence and leads

- `packages/app/src/App.tsx`, `DynamicRoot/DynamicRoot.tsx`, `DynamicRoot/ScalprumRoot.tsx`,
  `AppBase/AppBase.tsx` in this repository.
- Vault: `wiki/meta/nfs-migration-material-index.md` (canonical internal index,
  partially supersedes the older roadmap).
- Vault: `wiki/continuity/drydock-nfs-and-finish-journey.md` (Drydock/NFS handoff).
- Vault: `wiki/concepts/backstage-dynamic-plugin-mountpoints-vs-routes.md` (OFS
  loader versus NFS extension vocabulary).

The vault pages are prior internal synthesis, not substitutes for rechecking the
current source branches. Their corrected conclusions were used to choose what to
verify first; the claims above that matter for implementation are anchored in the
current repository and the official sources listed above.
