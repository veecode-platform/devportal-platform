# Target architecture — NFS arm

Status: working target; not a production acceptance claim

## Target statement

The NFS target is a real frontend application arm built on the New Frontend
System. It is not the current Scalprum root wrapped in a permanent compatibility
layer.

The intended shape is:

```text
app-next
  → @backstage/frontend-defaults / createApp
  → NFS extension graph and app.createRoot()
  → Standard Module Federation for dynamic frontend features
  → plugins that self-describe through NFS entrypoints and blueprints
```

During the transition, the existing `packages/app` OFS arm remains available.
The NFS arm can be selected explicitly and verified independently before it
becomes the production default.

## Runtime contract

The NFS runtime must make these choices observable:

- frontend package selected through `app.packageName`;
- feature discovery enabled through `app.packages` and explicit app overrides;
- Standard Module Federation enabled for dynamic NFS frontend assets;
- plugin artifacts and the selected frontend arm bound to exact image and
  artifact digests;
- the selected mode recorded in every Drydock report.

The current local experiment expresses this through `app-next`,
`app-config.nfs.yaml` and `ENABLE_STANDARD_MODULE_FEDERATION=true`. That proves
the direction, not the final production image packaging.

## Plugin contract

An NFS-capable frontend plugin owns its frontend declarations. Its package must
expose an NFS entrypoint, normally `./alpha`, whose default export is a
`createFrontendPlugin` result containing the appropriate blueprints and
extension modules.

The main migration moves responsibility from operator-authored OFS wiring to
plugin-owned NFS extensions:

| OFS/RHDH wiring | NFS target direction |
| --- | --- |
| `mountPoints` | entity blueprints such as `EntityCardBlueprint` or `EntityContentBlueprint` |
| `entityTabs` | entity content/page extensions, with the final blueprint and tab ownership verified per plugin |
| `dynamicRoutes` and `menuItems` | `PageBlueprint`, `SubPageBlueprint` and navigation extensions |
| `apiFactories` | plugin-owned `ApiBlueprint` extensions |
| `providerSettings` | plugin-owned settings extension or an explicitly application-owned settings surface |
| `scaffolderFieldExtensions` | NFS field-extension declarations, with the exact extension API verified per package |
| `techdocsAddons` | NFS TechDocs/addon extension or an explicit host-owned replacement |
| `signInPage` | application-owned authentication boundary or an explicit sign-in extension; not assumed to be a normal fleet plugin surface |
| application `provider`, `listener` and `header` mount points | host capability/extension boundaries; there is no accepted one-to-one blueprint mapping yet |
| `themes` | `ThemeBlueprint` |
| `translationResources` | translation extensions |
| `appIcons` | icon bundle or extension-owned icon declarations |

Application configuration remains available for adopter overrides and shared
integration data. It must not be used to recreate the entire old wiring model
inside the NFS arm.

## VeeCode-specific target

The stock NFS shell is only the platform base. The final VeeCode NFS arm must
make an explicit decision for each current shell behavior, including:

- sign-in and consent;
- VeeCode branding and theme;
- global header choice;
- translations;
- catalog customizations;
- scaffolder extensions;
- TechDocs and custom routes;
- shared provider and API behavior.

Each item is either ported as an NFS extension, replaced by the stock NFS
implementation, deliberately retired, or marked as a bounded parity gap. The
target architecture does not assume that line-for-line shell parity is useful.

## Target review against the current shell

The current OFS shell is not only a DynamicRoot loader. The host application
also owns:

- the Scalprum bootstrap, static plugin registration and delayed `AppBase`
  loading in [`packages/app/src/App.tsx`](../../../../packages/app/src/App.tsx:23);
- the static route graph, catalog table customization, entity-tab composition,
  scaffolder field extensions, TechDocs Mermaid addon, consent page and
  dynamic-route insertion in
  [`packages/app/src/components/AppBase/AppBase.tsx`](../../../../packages/app/src/components/AppBase/AppBase.tsx:129);
- the VeeCode sidebar, header mount points, application providers/listeners,
  custom menu behavior and permission-gated administration area in
  [`packages/app/src/components/Root/Root.tsx`](../../../../packages/app/src/components/Root/Root.tsx:300);
- custom API factories, including the legacy toast bridge and OIDC/Auth0/SAML
  auth APIs, in [`packages/app/src/apis.ts`](../../../../packages/app/src/apis.ts:66);
- a declared OFS dynamic-plugin contract containing routes, entity tabs,
  mount points, icons, APIs, settings, scaffolder extensions, sign-in,
  TechDocs addons, themes and translations in
  [`packages/app/config.d.ts`](../../../../packages/app/config.d.ts:129).

The current NFS experiment is materially smaller: `app-next` calls
`createApp()`, includes the stock catalog and Kubernetes references, and uses a
fixture-backed NFS config. It does not yet implement VeeCode shell parity or
load a VeeCode NFS artifact. Therefore the target has two separate porting
fronts: the custom host shell and the declared plugin fleet.

This review is source evidence, not a parity decision. The required behavior
for each host surface remains in the [shell parity matrix](shell-parity-matrix.md).

## Boundaries still open

This document does not settle:

- whether the final packaging boundary is `app-next` alone or a separate
  `nfs-port` module;
- which VeeCode shell features are required for production parity;
- whether every third-party plugin must be ported before the NFS arm ships;
- the complete configuration-composition contract across the fleet.

Those questions require the gates and inventory below.

## Sources

- [Initial investigation](../research/2026-07-28-ofs-nfs-initial.md)
- [Backstage — Migrating Apps](https://backstage.io/docs/frontend-system/building-apps/migrating/)
- [RHDH — Migrating plugins](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-plugins-to-new-frontend-system.md)
- [RHDH — Migrating configuration](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/migrating-config-to-new-frontend-system.md)
