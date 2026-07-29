# Shell parity matrix

Status: initial working matrix; dispositions are not accepted decisions

The NFS arm is not accepted merely because the stock `createApp()` shell boots.
This matrix turns the custom VeeCode shell into explicit questions. Each row
must eventually say whether the behavior is ported, replaced, retired or kept
as a bounded gap, and what evidence justifies that choice.

The matrix intentionally distinguishes a user-facing behavior from its OFS
implementation. The migration target is the behavior that the product needs,
not a line-for-line reproduction of the old wiring.

## Matrix

| Shell surface | OFS source/behavior to inspect | NFS candidate direction | Disposition | Evidence required | Status |
| --- | --- | --- | --- | --- | --- |
| App boot and package selection | [`packages/app/src/App.tsx`](../../../../packages/app/src/App.tsx:23), backend app selection and current image entrypoint | `app-next`, `createApp()` and explicit NFS config | port | Build, backend readiness, selected package and exact image/config provenance | Gate 0 slice passed locally; production packaging open |
| Sign-in and consent | [`VeeCodeSignInPage`](../../../../packages/app/src/components/VeeCodeSignInPage/VeeCodeSignInPage.tsx:8), custom providers and [`ConsentPage`](../../../../packages/app/src/components/Auth/ConsentPage.tsx:29) | Stock NFS auth surface or an explicit host extension | pending | Same auth mode, redirect/consent behavior and negative-path proof in NFS mode | source mapped; disposition open |
| VeeCode branding and theme | `app.branding`, `SidebarLogo`, favicon update and legacy theme registration | NFS theme extension, stock theme or bounded CSS host behavior | pending | Visual and behavioral parity criteria agreed before browser comparison | source mapped; disposition open |
| Global header | [`ApplicationHeaders`](../../../../packages/app/src/components/Root/ApplicationHeaders.tsx:46) and `application/header` mount points | NFS host extension or stock shell capability | pending | Route-level browser proof for required header actions | source mapped; disposition open |
| Translations | `i18n`, custom translation hooks/resources and dynamic `translationResources` | NFS translation extension or application-owned resource registration | pending | Locale selection and representative translated surfaces | source mapped; disposition open |
| Catalog entity content | [`entityPage`](../../../../packages/app/src/components/catalog/EntityPage/EntityPage.tsx:32), dynamic entity tabs and mount-point declarations | Entity blueprints such as `EntityCardBlueprint` or `EntityContentBlueprint` | port/replace per surface | Entity fixture, route, rendered surface and plugin attribution | partially mapped; cohort starts with Kubernetes and `github-workflows` |
| Catalog pages and navigation | Static routes in [`AppBase`](../../../../packages/app/src/components/AppBase/AppBase.tsx:180), dynamic routes and `menuItems` in [`Root`](../../../../packages/app/src/components/Root/Root.tsx:300) | `PageBlueprint`, `SubPageBlueprint` and navigation extensions, subject to package inspection | pending | Route and navigation assertions for every required page | source mapped; disposition open |
| Catalog custom behavior | Custom “Created At” table column and initial graph relation/kind selection | NFS catalog extension or an explicitly host-owned replacement | pending | Catalog list and graph assertions against representative entities | source mapped; disposition open |
| Scaffolder | `ScaffolderFieldExtensions`, `LayoutCustom` and VeeCode repo/resource pickers | NFS plugin-owned extensions or stock replacement | pending | Representative template/action/field flows in NFS mode | source mapped; disposition open |
| TechDocs | Static docs routes and Mermaid addon in [`AppBase`](../../../../packages/app/src/components/AppBase/AppBase.tsx:226) | Stock NFS implementation plus explicit custom extension decisions | pending | Documentation route, provider behavior and custom extension proof | source mapped; disposition open |
| Application providers and listeners | [`ApplicationProvider`](../../../../packages/app/src/components/Root/ApplicationProvider.tsx:71) and [`ApplicationListener`](../../../../packages/app/src/components/Root/ApplicationListener.tsx:64) | NFS host capability/extension boundary; exact API still open | pending | Provider/listener activation, error isolation and attributable owner | source mapped; disposition open |
| Provider and API behavior | Custom factories in [`apis.ts`](../../../../packages/app/src/apis.ts:75), auth refs and shared integration setup | NFS `ApiBlueprint`/extension declarations plus application configuration | pending | API resolution, auth/config contract and consumer behavior | source mapped; disposition open |
| User settings and provider settings | `settingsPage` and dynamic `providerSettings` | NFS settings extension or application-owned settings surface | pending | Settings route and representative provider configuration flow | source mapped; disposition open |
| Dynamic plugin discovery | [`ScalprumRoot`](../../../../packages/app/src/components/DynamicRoot/ScalprumRoot.tsx:41), `DynamicRoot` and overlay wiring | Standard Module Federation and NFS package discovery | port | Artifact manifest, package entrypoint, load logs and rendered surface | NFS shell/control slice proven; fleet open |
| Themes/icons/resources | `themes`, `appIcons` and `translationResources` overlay fields | NFS-owned declarations or explicit host resources | pending | Resource appears in the right mode and is attributable to its owner | source mapped; disposition open |

## Disposition vocabulary

- `port`: preserve the required behavior through NFS-native declarations.
- `replace`: adopt a stock or newly designed NFS behavior that satisfies the
  product requirement without preserving the OFS implementation.
- `retire`: explicitly remove the behavior because it is no longer required.
- `bounded-gap`: keep the gap visible and accepted only with an owner, impact,
  scope and follow-up decision.
- `pending`: insufficient evidence or product priority to choose a disposition.

## Review rule

No row becomes a migration decision from source inspection alone. Before
cutover, each `pending` row must either receive a disposition with runtime
evidence or be converted into a named bounded gap/escalation. The final review
must link each required row to a gate result and to the exact app, image and
configuration used.

## Related documents

- [NFS target](target-nfs.md)
- [Current OFS baseline](baseline-ofs.md)
- [Modes and gates](../gates/modes-and-gates.md)
