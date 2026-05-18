---
name: theming
description: How the VeeCode theme is delivered as a dynamic plugin, and how to ship a customer brand the same way.
type: topic
audience: [operator, plugin-author]
related: [presets, dynamic-plugins, plugin-packaging]
---

# Theming

## What this is

The VeeCode visual identity is delivered as a **dynamic frontend plugin** —
`veecode-platform-plugin-veecode-theme-dynamic` — enabled by a dedicated preset,
`veecode-theme`. It is not baked into `recommended`.

The theme plugin exports two theme providers (`VeecodeLightThemeProvider`,
`VeecodeDarkThemeProvider`) using `createUnifiedTheme` from `@backstage/theme`.
Each provider carries palette overrides, typography, MUI v5 `components:` key
overrides (buttons, cards, inputs, tables), and a `--bui-*` CSS token file so
BUI-rendered surfaces (`@backstage/ui`) match the VeeCode palette. The dynamic
plugin is wired into the running app through the `themes:` config block in
`dynamic-plugins.default.yaml` (lines 389–408); `DynamicRoot.tsx` discovers those
entries at runtime and merges them into the `themes` array passed to `createApp`
(`DynamicRoot.tsx:533-553,600-636`). See
[ADR-011 § "The theme is a dynamic frontend plugin"](../adr/011-frontend-design-system.md).

The theme preset is Phase 1 of ADR-011 — validated on branch
`feat/veecode-theme-dynamic-plugin`, against Backstage 1.50, with five
explicit pass criteria including picker replacement, no id collision, and
CSS injection. ADR-011 § "Phase 2" describes the future migration to
`ThemeBlueprint` once NFS core packages leave `@alpha`; nothing in Phase 1 blocks
that later work.

### The header is always on

The Core-tier plugin `veecode-platform-plugin-veecode-global-header-dynamic` ships
`disabled: false` unconditionally — it is always loaded regardless of the preset
list. That means the VeeCode header and logo appear even under
`VEECODE_PRESETS=recommended` with no theme preset. What `veecode-theme` adds is
the **full identity**: palette, typography, MUI component overrides, and BUI tokens.
The image reads as VeeCode chrome-wise without the theme preset; it reads as the
complete VeeCode product with it.

---

## Why a preset and not baked into `recommended`

Presets are flat — there is no `include`/`extends` between them
(`presets/SCHEMA.md`). Composition is the `VEECODE_PRESETS=a,b,c` list. That
flatness is the key constraint:

`createApp`'s `themes` array does not deduplicate dynamic theme providers.
`DynamicRoot` (`DynamicRoot.tsx:600-636`) drops a *static* theme only when a
*dynamic* provider shares its `id`. Two theme *plugins* that both register `id:
light` and `id: dark` result in duplicate ids in `themes`; the picker shows both,
and `activeThemeId` resolves to whichever config-merge order wins — not to the one
the operator intended. See ADR-011 § "Why a separate preset rather than folding the
theme into `recommended`" for the full derivation.

The consequence: a clean customer brand swap only works if exactly **one** theme
plugin is loaded at a time. Keeping `veecode-theme` in its own preset means a
customer **replaces** it in the list (`VEECODE_PRESETS=recommended,<company>-theme`)
rather than stacking on top of it. If the theme were inside `recommended`, the
customer would have to `disabled: true` the VeeCode plugin from their own preset —
a coupling we deliberately avoid.

---

## What `veecode-theme` does

The preset does two things and nothing else.

**1. Enables the dynamic plugin.**

`presets/veecode-theme.yaml` carries:

```yaml
plugins:
  - package: oci://${PLUGIN_REGISTRY}/veecode-theme:bs_${BACKSTAGE_VERSION}!veecode-platform-plugin-veecode-theme
    disabled: false
```

The corresponding entry in `dynamic-plugins.default.yaml` (lines 385–408) ships
`disabled: true`. The install script merges entries by package name; the preset
flips `disabled` to `false` for that exact entry. A name mismatch installs a
second copy, both register the same theme ids, and React unmount churn follows —
which is why `presets/veecode-theme.yaml` carries a comment warning against it.

The `pluginConfig` block in `dynamic-plugins.default.yaml` declares:

```yaml
themes:
  - id: light
    title: VeeCode Light
    variant: light
    importName: VeecodeLightThemeProvider
  - id: dark
    title: VeeCode Dark
    variant: dark
    importName: VeecodeDarkThemeProvider
```

The ids `light` and `dark` are deliberate — they match the static default theme
ids from `@red-hat-developer-hub/backstage-plugin-theme`. `DynamicRoot` drops a
static theme when a dynamic provider shares its id, so the VeeCode providers
**replace** (not stack on) the RHDH fallback themes. When `veecode-theme` is not in
the preset list, the static RHDH fallback themes remain — there is no empty picker.

**2. Sets `app.branding`.**

The preset's `appConfig` block layers into the config chain at boot:

```yaml
appConfig:
  app:
    title: VeeCode DevPortal
    branding:
      fullLogo: /veecode-logo.png
      iconLogo: /veecode-logo.png
      fullLogoWidth: 150
```

Assets at `/veecode-logo.png` and `/favicon.ico` are bundled in `packages/app/public/`
and served by the backend static handler — they are available at root-relative URLs
without any operator configuration. Operators override them via `app-config.local.yaml`
or an environment-specific config file; see the [configuration layering](configuration-layering.md)
topic for where operator overrides land in the merge chain.

---

## Customizing the theme as a customer

The worked example is `presets/veecode-theme.yaml` itself.

**Step 1.** Copy it:

```bash
cp presets/veecode-theme.yaml presets/<company>-theme.yaml
```

**Step 2.** Update the `name:` field at the top of the file to match the filename
stem (`<company>-theme`).

**Step 3.** Point the `plugins:` entry at your bundle:

```yaml
plugins:
  - package: oci://registry.<company>/themes:bs_${BACKSTAGE_VERSION}!<company>-theme-dynamic
    disabled: false
```

The OCI ref format is `oci://<registry>/<repository>:<tag>!<selector>` where
`selector` is the npm package name inside the bundle. The `bs_${BACKSTAGE_VERSION}`
tag convention keeps the bundle pinned to the same Backstage version as the image.

**Step 4.** Update `appConfig.app.branding` to your assets:

```yaml
appConfig:
  app:
    title: Acme Developer Portal
    branding:
      fullLogo: /acme-logo.svg
      iconLogo: /acme-icon.svg
      fullLogoWidth: 180
```

**Step 5.** Run with your preset replacing `veecode-theme`:

```
VEECODE_PRESETS=recommended,<company>-theme
```

The customer **replaces** `veecode-theme` in the list; they do not compose on top
of it. Running `recommended,veecode-theme,<company>-theme` loads two theme plugins
and produces the duplicate-id problem described above.

---

## Authoring a new theme plugin

Build details and the full `rhdh-cli plugin export` pipeline are deferred to the
future `plugin-packaging` topic. The gotchas below come from ADR-011's validated
POC (`feat/veecode-theme-dynamic-plugin`) and are load-bearing.

### Use `rhdh-cli`, not `janus-cli`

```bash
npx @rhdh/cli plugin export
```

`janus-cli` has a webpack CSS-import bug that silently drops CSS bundled inside
the MF chunk. Your `--bui-*` token overrides will be missing at runtime and you
will not get an error. `rhdh-cli` is the current maintained fork and does not have
this bug. (ADR-011 validation criterion 5: the CSS injection was confirmed with
`rhdh-cli`; `janus-cli` was not re-tested after the bug was identified in the RHDH
migration notes.)

### `sideEffects` in `package.json`

```json
"sideEffects": ["**/*.css"]
```

Without this, webpack tree-shakes the CSS import out of the MF bundle. The import
exists in source; the token overrides are absent at runtime. There is no build
error.

### `react` and `react-dom` in `peerDependencies`, not `dependencies`

The theme plugin must not bundle its own copy of React or MUI. List them as peers:

```json
"peerDependencies": {
  "react": "^18.0.0",
  "react-dom": "^18.0.0"
},
"dependencies": {
  "@backstage/theme": "..."
}
```

Zero `@mui/material` in `dependencies`. MUI in `dependencies` produces a second
MUI instance at runtime; component-style overrides registered through your
`UnifiedThemeProvider` apply to the bundled MUI, not to the host's MUI, and
nothing changes visually.

### Theme ids must match the static defaults

Use `id: light` and `id: dark` (not `id: <company>-light`, `id: <company>-dark`,
etc.). `DynamicRoot`'s filter (`DynamicRoot.tsx:600-636`) removes a static theme
only when a dynamic theme shares its exact id. If your ids don't match, both your
theme and the RHDH static fallback appear in the picker as separate entries —
duplicates with no collision resolution.

---

## The minimum-VeeCode-identity fallback

The Core-tier `veecode-platform-plugin-veecode-global-header-dynamic` plugin is
always loaded; its `disabled: false` entry in `dynamic-plugins.default.yaml` is
unconditional and no preset gates it. The VeeCode header and sidebar logo render
even under `VEECODE_PRESETS=recommended` or a purely customer-branded preset list.

This means: removing `veecode-theme` from your preset list does not produce a
naked Backstage UI. It produces a VeeCode-chrome UI with the RHDH stock color
palette. That stock palette is what a customer sees before they load their own
theme plugin. See ADR-011 § "A minimal VeeCode identity survives without the theme
preset".

---

## Related topics

- [presets](presets.md) — how presets are composed, validated, and layered into
  the config chain; the `requires.variables` boot-fail contract
- [dynamic-plugins](dynamic-plugins.md) — how the OCI install script resolves
  bundles, merges `pluginConfig`, and writes the runtime config consumed by
  `DynamicRoot`
- `plugin-packaging` (forthcoming) — the full `rhdh-cli plugin export` pipeline,
  OCI bundle layout, and how to publish a bundle to a registry the image can pull
  from
