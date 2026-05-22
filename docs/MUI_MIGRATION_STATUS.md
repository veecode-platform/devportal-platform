# MUI Migration Status

`devportal-platform` is on **MUI v5 from day one** —
`@mui/material@^5.15.10` is the only MUI in
[`packages/app/package.json`](../packages/app/package.json), and
there is no v4 (`@material-ui/*`) anywhere in the tree.

A small `@mui/styles/makeStyles` surface remains in
[`packages/app/`](../packages/app/), as the v4-style API on v5:

- `packages/app/src/components/VeeCodeSignInPage/styles.tsx`
- `packages/app/src/components/VeeCodeSignInPage/plataformLogo/plataformLogo.tsx`
- `packages/app/src/components/VeeCodeSignInPage/customProvider.tsx`
- `packages/app/src/components/scaffolder/LayoutCustom.tsx`
- `packages/app/src/components/DynamicRoot/DevportalIcon.tsx`
- `packages/app/src/components/Root/LogoFull.tsx`

An additional 4 files use `makeStyles` via `tss-react/mui` (the v5-compatible community shim):
- `packages/app/src/components/catalog/Grid/Grid.tsx`
- `packages/app/src/components/search/SearchPage.tsx`
- `packages/app/src/components/Root/Root.tsx`
- `packages/app/src/components/Root/SidebarLogo.tsx`

Both `@mui/styles` and `tss-react/mui` are migrated opportunistically to `styled()` or `sx` when those files are touched.

These are not on a forced migration timeline — `@mui/styles` is a
supported MUI v5 package, and the `makeStyles` API works against the
same theme as `styled()` / `sx`. They are migrated opportunistically
when those files are touched for other reasons, to `styled()` or the
`sx` prop.

The frontend also uses [`@backstage/ui`](https://ui.backstage.io)
(BUI, formerly Canon) `^0.13.2`. BUI is React-Aria + CSS custom
properties (no MUI underneath); it coexists with MUI by design.
Theming overrides for BUI live as `--bui-*` CSS variables in the
veecode-theme plugin
([`adr/011-frontend-design-system.md`](adr/011-frontend-design-system.md)
§ "The theme is a dynamic frontend plugin").

For background on the design-system direction (theming via a dynamic
plugin, deferred New Frontend System migration), read ADR-011 in full.
