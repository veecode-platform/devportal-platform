# ADR-011: Frontend design system — VeeCode theme as a dynamic plugin and a preset

## Status

Accepted — 2026-05-12 (POC validated on branch `feat/veecode-theme-dynamic-plugin`;
see "Validation criteria" below).

Builds on ADR-010 (the theme ships through the preset catalog, as its
own preset composed alongside `recommended`). Preserves ADR-001
(Scalprum) and ADR-004 (static vs dynamic split). Defers the New
Frontend System migration to a separate, gated epic.

## Context

VeeCode DevPortal runs Backstage's **legacy frontend system** —
`createApp` from `@backstage/app-defaults@^1.7.7`
(`packages/app/src/components/DynamicRoot/DynamicRoot.tsx:609`) —
inside an RHDH-derived Scalprum / Module-Federation dynamic-plugin
shell (`packages/app/src/components/DynamicRoot/`). Theming uses
`createUnifiedTheme` (`@backstage/theme@^0.7.3`) via
`@red-hat-developer-hub/backstage-plugin-theme@^0.10.0` — `useThemes()`
in `DynamicRoot.tsx:154` feeds the `themes:` array of `createApp`,
where it is merged with theme providers discovered from dynamic-plugin
configs (`DynamicRoot.tsx:533-553,636`). The palette is configured
through `app-config.yaml` `app.branding.theme` (the RHDH theme-config
schema). MUI v5 (`@mui/material@^5.15.10`) is the component library, with
a v4 compatibility layer (`docs/MUI_MIGRATION_STATUS.md`). `@backstage/ui`
("BUI", formerly Canon) `^0.14.0` is already a direct dependency and its
base CSS is imported at `packages/app/src/index.tsx:1` — it came with the
RHDH 1.50 app skeleton, so BUI-rendered surfaces already exist in the
bundle.

We want a distinctive VeeCode visual identity. And — following ADR-010's
thesis that the product's differentiation lives at the **curation layer**,
not the image-topology layer — we want the *way we deliver* that identity
to be the same pattern a customer uses to skin the IDP for their own
company. The theme should be both: part of the VeeCode product identity,
**and** a worked example of how to customize.

Three facts about the upstream state constrain *how* we do this (from a
dedicated investigation of the New Frontend System and `@backstage/ui`):

1. **`@backstage/ui` (BUI) is pre-1.0.** Published, MUI-free (React Aria +
   `--bui-*` CSS custom properties), but `0.14.x` with breaking changes
   shipped as minors, ~50 components, not at MUI parity; Backstage core is
   only ~9% migrated off MUI (backstage/backstage#31467). It coexists with
   MUI by design (`bui-*` classes vs `UnifiedThemeProvider`), themed via a
   CSS file that overrides `--bui-*` properties.
2. **The New Frontend System (NFS) is "adoption-ready / 1.0-RC" in
   messaging but its core packages are still `@alpha`** as of Backstage
   1.49/1.50; legacy removal has no announced date. Plugins still
   dual-export via `/alpha`.
3. **Migrating a Scalprum distro to NFS is a major, multi-release effort**
   — app-shell rewrite (`app-defaults` → `frontend-defaults`,
   `FlatRoutes` → declarative extensions), per-plugin conversion to
   blueprints, and replacing the entire Scalprum / `janus-cli` packaging
   pipeline with `@backstage/frontend-dynamic-feature-loader` +
   `backstage-cli package bundle`. RHDH itself (RHDH 1.9 = Backstage
   1.45.3) has not done it and has published no target version, although
   Red Hat is driving the upstream MF-for-NFS work (backstage/backstage#28076,
   RFC #17054). We mirror RHDH's app skeleton; we follow, we don't lead.

## Decision

Build the VeeCode design system **on the current (legacy) frontend
system**, **delivered as a dynamic plugin enabled by a preset** — not by
adopting BUI as a primary kit, and not by migrating to the New Frontend
System now.

### 1. The theme is a dynamic frontend plugin

Publish `veecode-platform-plugin-veecode-theme` as an OCI bundle via
`devportal-plugin-export-overlays` (originally authored in the now-deleted
`dynamic-plugins/` workspace; migrated upstream as part of Phase 2 of the
OCI swap). It exports a theme provider — the same shape RHDH's
`@red-hat-developer-hub/backstage-plugin-theme` provides, but shipped as
a Module-Federation dynamic plugin. RHDH documents the
dynamic-theme contract — an entry in a frontend plugin's `themes` config
array (`id` / `title` / `variant` / `icon` / `importName`) pointing at an
exported theme provider; see `redhat-developer/rhdh`
`docs/dynamic-plugins/frontend-plugin-wiring.md`, "Adding a custom
theme" — and the `DynamicRoot` shell already discovers theme providers
from dynamic-plugin configs (`DynamicRoot.tsx:533-553,600-636`), so the
machinery exists. It carries:

- a `createUnifiedTheme()` configuration — palette, typography (font
  families, scale), `shape`/radius, density, per-page header themes;
- `components:` overrides restyling MUI v5 surfaces (buttons, cards,
  inputs, tables, …) — this is where most of the "doesn't look like stock
  Backstage" lives;
- a `--bui-*` token CSS file (Module-Federation bundles ship their own
  CSS), imported so the BUI-rendered surfaces already in the bundle match
  the VeeCode brand.

App-shell code that is **not** theme-able — the Root layout / sidebar
structure / `AppComponents` swaps in `packages/app/src/components/` —
stays in `packages/app` and is *not* part of the preset model. In
practice that is a small residue: logo, header, menu items, palette,
typography, component styling and BUI tokens are all reachable via
`{ theme dynamic plugin + app.branding config + global-header mount
points }` (the devportal already uses
`veecode-platform-plugin-veecode-global-header-dynamic`), so the preset
model covers the customer-customization story even though it does not
cover every pixel of chrome. The one notable exception is the sign-in
page: `SignInPage` is a VeeCode-custom component wired in
`packages/app/src/components/DynamicRoot/defaultAppComponents.tsx:33-38`
(the dynamic-plugin config can override it, but the shipped one is static
code) — branding the login screen is not, today, reachable through the
preset/`app.branding` path.

### 2. The theme is its own preset, composed alongside `recommended` — not baked into it

- **The theme plugin is a proto-template.** It ships `disabled: true` in
  `dynamic-plugins.default.yaml`, like every other shippable plugin.
- **It is enabled by its own preset, `presets/veecode-theme.yaml`** —
  which also sets `app.branding` (logos, etc.) in `appConfig`.
  **`recommended.yaml` does not carry the theme.** The standard
  out-of-the-box VeeCode look is the composed pair
  `VEECODE_PRESETS=recommended,veecode-theme` (and the image may default
  its `VEECODE_PRESETS` to that pair).
- **Why a separate preset rather than folding the theme into `recommended`.**
  Presets are flat — there is no `include`/`extends` between them
  (`presets/SCHEMA.md`); composition is the `VEECODE_PRESETS=a,b,c` list.
  And `createApp`'s `themes` array does not deduplicate dynamic theme
  providers: `DynamicRoot` (`DynamicRoot.tsx:600-636`) drops a *static*
  theme only when a *dynamic* provider shares its `id` — two theme
  *plugins* that both register, say, `id: light` / `id: dark` put
  duplicate ids into `themes`, the picker shows both, and `activeThemeId`
  resolves the first by config-merge order, not by preset order. So a
  clean "customer theme overrides ours" only works when exactly one theme
  plugin is loaded. Keeping the VeeCode theme in its own preset means the
  customer **replaces** `veecode-theme` with their preset in the
  `VEECODE_PRESETS` list (`recommended,<company>-theme`) instead of
  stacking on top of it — one theme plugin, no id collision. (If we'd put
  the theme in `recommended`, the customer would either inherit a duplicate
  theme or have to `disabled: true` our plugin from their preset — both
  worse.)
- **A minimal VeeCode identity survives without the theme preset.** The
  always-on (Core-tier) `veecode-platform-plugin-veecode-global-header-dynamic`
  gives the image a VeeCode header/logo even under `VEECODE_PRESETS=recommended`
  alone; the `veecode-theme` preset adds the *full* identity — palette,
  typography, MUI component overrides, BUI tokens. So the image still reads
  as VeeCode without the theme preset, just less completely.
- **`presets/veecode-theme.yaml` is the worked customization example.** A
  customer copies it to `presets/<company>-theme.yaml`, repoints it at
  their own theme provider — fork `veecode-platform-plugin-veecode-theme-dynamic`
  or write one following RHDH's dynamic-theme contract
  (`frontend-plugin-wiring.md`) — sets their `app.branding`, and runs
  `VEECODE_PRESETS=recommended,<company>-theme`.

This is deliberate dogfooding: the mechanism we ship the VeeCode look
through is exactly the mechanism we tell customers to use — a dynamic
plugin enabled by a preset, composed into the list — not a privileged
internal path.

### 3. Phase the rest

- **Phase 1.** *Completed.* The theme plugin is now published as an OCI
  bundle by `devportal-plugin-export-overlays`
  (`oci://${PLUGIN_REGISTRY}/veecode-theme:bs_${BACKSTAGE_VERSION}!veecode-platform-plugin-veecode-theme`),
  versioned alongside the rest of the dynamic plugin set. Allow new
  *VeeCode-internal* screens (admin pages, the dynamic-plugins-info
  plugin, a custom landing) to be authored against BUI components
  opportunistically — per-surface, not as a program. Keep
  `@backstage/plugin-mui-to-bui` (MUI-theme → BUI-CSS converter, in
  development) on the radar.
- **Phase 2 (gated).** Plan the New Frontend System migration as its own
  epic, gated on: NFS core packages going `@public`;
  `@backstage/frontend-dynamic-feature-loader` leaving experimental; and
  RHDH publishing its Scalprum→NFS migration path. At that point the theme
  plugin is re-expressed as a `ThemeBlueprint` inside a
  `createFrontendModule({ pluginId: 'app', extensions: [...] })`, and
  `app.branding.theme`-style config moves to the new model. None of this
  blocks Phase 0.

### 4. Decoupled from the 1.50 bump

None of the above is coupled to the Backstage 1.49→1.50 migration beyond
the Phase-0 theme work itself.

## Why not the alternatives

- **Adopt BUI as the primary component kit (now).** Not viable: rebuilding
  the portal UI on a `0.14.x` kit that is not at MUI parity, while every
  RHDH/community plugin we load is MUI, means fighting two design systems —
  the heavier one outside our control. Partial use (token overrides;
  greenfield internal screens) *is* viable and is folded into the decision
  above; wholesale adoption is not.
- **Theme as static code in `packages/app`** (registered directly in
  `createApp({ themes: [...] })`). Simpler, but it is *not*
  preset-controllable — it would always be there, and it could not be the
  customer-customization example. The dynamic-plugin form is the point.
- **Theme folded into `recommended.yaml`** (recommended-tier, always on
  with `recommended`). Tempting — the theme passes the recommended-tier
  admission test (zero config, makes the image read as VeeCode). Rejected
  because it makes the customer override messy: with the theme baked into
  `recommended`, a customer running `recommended,<company>-theme` loads
  *two* theme plugins, and the override only resolves cleanly if they
  reuse our theme `id`s or `disabled: true` our plugin from their preset.
  Its own preset, swapped in the list, is clean (see §2).
- **Migrate to the New Frontend System first.** Not a prerequisite for a
  design system (theming works on both, differently). It is a prerequisite
  for the declarative extension model and for long-term alignment with
  upstream/RHDH's dynamic-plugin direction — but doing it during the 1.50
  bump is scope we cannot afford, and RHDH has not done it. Tracked as
  Phase 2.

## Consequences

### Benefits

- Distinctive branding shippable in days–weeks; low risk; contained to the
  `dynamic-plugins/` workspace plus one preset.
- The delivery mechanism **is** the customer-customization mechanism — a
  dynamic plugin enabled by a preset. We use the path we document.
- Survives the 1.50 bump untouched; stays aligned with RHDH's architecture
  (we already mirror their app skeleton and their `themes:` merge path).
- Keeps the door open to BUI and to NFS without betting on either's current
  maturity.

### Costs / accepted

- **Two theming surfaces** to maintain: the `UnifiedThemeProvider`
  configuration inside the theme plugin (MUI surfaces) and the `--bui-*`
  token CSS (BUI surfaces). Unavoidable given the upstream MUI→BUI
  transition state; mitigated by keeping the BUI override file small.
- A future NFS migration will require re-expressing the theme as a
  `ThemeBlueprint`; we deliberately do not get NFS's declarative extension
  model in the meantime.
- The theme-as-dynamic-plugin path is slightly less trodden than RHDH's
  static `@red-hat-developer-hub/backstage-plugin-theme` import; mitigated
  by the fact that `DynamicRoot` already supports dynamic theme providers
  and RHDH documents the contract (`frontend-plugin-wiring.md`), and a
  static-theme fallback is available if the dynamic path bites.
- The *full* VeeCode look requires `veecode-theme` in the preset list (the
  documented default `recommended,veecode-theme`), not just `recommended`.
  Accepted, in exchange for a clean customer override (one theme plugin
  loaded, no `id` collision).

### Risks

- **BUI breaking changes in minors** could churn the `--bui-*` override
  set (e.g. the `0.13` `--bui-bg` → `--bui-bg-surface-0` rename).
  Mitigation: keep that file small and track BUI releases. The
  `@backstage/ui` version resolved in `yarn.lock` must be bumped in step
  with `@backstage/core-app-api` / `@backstage/plugin-app` — BUI's docs
  warn that upgrading `@backstage/ui` out of sync with the app-api
  packages breaks client-side routing in BUI components (`Link`, `Tabs`,
  `Menu`, `Table` fall back to full-page navigation).
- **CSS inside the Module-Federation bundle.** It is not yet verified that
  the `--bui-*` override CSS shipped *inside* the theme plugin's MF bundle
  is injected at remote-load time and cascades *after* the static
  `@backstage/ui/css/styles.css` import in `packages/app/src/index.tsx:1`.
  RHDH frontend dynamic plugins ship their own CSS in `dist-scalprum/`, so
  this should hold — but it is a POC validation item (criterion 5 below),
  not an assumption. Fallback if it doesn't: ship the BUI token overrides
  as a static import in `packages/app` instead of inside the plugin.
- The dynamic theme-provider discovery in `DynamicRoot` is RHDH-derived
  code we do not own. Mitigation: it is already in use; it is pinned with
  the rest of the RHDH shell.

### Revisit when

NFS core packages go `@public`; RHDH announces a Scalprum→NFS migration;
BUI reaches 1.0 / MUI parity; or `@backstage/plugin-mui-to-bui` ships and
changes the cost calculus.

## Validation criteria

POC results (branch `feat/veecode-theme-dynamic-plugin`, against the
`veecode/devportal-platform:latest` image via `scripts/dev-run.sh`, Backstage 1.50):

1. **PASS.** The wrapper is `veecode-platform-plugin-veecode-theme`;
   `rhdh-cli plugin export` (the `tsc`→`export-dynamic` path — `backstage-cli
   package build` is *not* needed and currently breaks on the CSS import)
   produces `dist-dynamic/dist-scalprum/` with the MF remote entry +
   `plugin-manifest.json`. The exported artifact is
   `veecode-platform-plugin-veecode-theme-dynamic`; scalprum loads it
   (`Loaded dynamic frontend plugin 'veecode-platform-plugin-veecode-theme-dynamic'`)
   and serves its manifest at `/api/scalprum/veecode-platform.plugin-veecode-theme/…`.
2. **PASS.** `dynamic-plugins.default.yaml` carries the artifact `disabled: true`
   with the `themes:` block (ids `light`/`dark`); `presets/veecode-theme.yaml`
   flips it on; `recommended.yaml` does not. With
   `VEECODE_PRESETS=recommended,veecode-theme` the Settings → Appearance picker
   shows **`VEECODE LIGHT` / `VEECODE DARK` / `AUTO`** — no plain `Light`/`Dark`,
   i.e. the static `@red-hat-developer-hub/backstage-plugin-theme` themes are
   replaced by id — and both render (dark `#333` background, `#1b1f23` sidebar,
   teal `#00857a` accents / page-header wave gradient, no-uppercase buttons,
   rounded cards).
3. **PASS.** `VEECODE_PRESETS=veecode-theme` alone → VeeCode theme applied, no
   `recommended` plugins (no Marketplace/Tech Radar in the sidebar; ~15 catalog
   entities instead of ~220). Preset is self-contained.
4. **PASS (via the inverse).** Dropping `veecode-theme` from the list
   (`VEECODE_PRESETS=recommended`) reverts the picker to plain `LIGHT`/`DARK`
   (static RHDH fallback) with no leftover VeeCode entry — proving theme
   presence is fully controlled by whether `veecode-theme` (or a copied
   `<company>-theme`) is in the list, with no id collision. A throwaway second
   theme plugin to demo the positive `recommended,<company>-theme` case was not
   built — the replace-in-list mechanism is established by this inverse.
5. **PASS, with a follow-up.** `rhdh-cli plugin export` (webpack) bundles
   `src/styles/bui-tokens.css` into the MF chunk; at runtime `--bui-bg-solid`
   resolves to `#00857a` (our override) with the plugin loaded vs `#1f5493`
   (the `@backstage/ui` default) without it — so the MF-bundled CSS injects and
   wins. **Follow-up:** the dark-variant override used `[data-theme='dark']`,
   which `@backstage/ui` ^0.14 does not use — the dark selector name needs to
   be read from `@backstage/ui/dist/css/styles.css` and corrected (phase E).
   Also: token names beyond `--bui-bg-solid*` were read from 0.13.2 and want a
   pass against the app's resolved 0.14.x.

Known follow-ups (phase E): correct the BUI dark selector + token names;
refine palette/typography/component overrides; consider a `dist/` (Rollup) build
or removing the `build` script if it stays broken; the `scripts/dev-run.sh`
overlay needs the host `.devrun-cache/dynamic-plugins-root` made writable
(`chmod a+rwX`) for `install-dynamic-plugins.py` to (re)generate config — worth
folding into `dp-extract`.

## Related decisions

- ADR-001: Scalprum dynamic plugins — preserved (the theme is one more
  dynamic plugin).
- ADR-004: Static vs dynamic plugins — preserved.
- ADR-009: Configuration profiles → presets — same generalization (a theme
  is one species of preset).
- ADR-010: Unified image, preset catalog, OCI dynamic plugins — the theme
  ships through that preset model, as its own preset (`veecode-theme.yaml`)
  composed alongside `recommended`, not folded into it.

## References

- `docs/MUI_MIGRATION_STATUS.md` — MUI v4→v5 compat layer status.
- `presets/README.md`, `presets/SCHEMA.md` — preset catalog and format
  (presets are flat — no `include`/`extends`; composition via `VEECODE_PRESETS`).
- `redhat-developer/rhdh` `docs/dynamic-plugins/frontend-plugin-wiring.md`
  — "Adding a custom theme" (the dynamic-theme contract this ADR follows).
- ui.backstage.io · backstage.io/docs/frontend-system · backstage.io/docs/conf/user-interface
- backstage/backstage#31467 (MUI → BUI migration tracking) · #28076
  (Module-Federation for the New Frontend System) · #17054 (RFC) ·
  `@backstage/frontend-dynamic-feature-loader`
- New Frontend System / `@backstage/ui` investigation (2026-05-12).
