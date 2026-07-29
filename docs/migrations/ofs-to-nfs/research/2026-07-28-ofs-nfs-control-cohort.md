# OFS to NFS: Gate 0.5 control cohort

Status: Gate 0.5 in progress

## Purpose

Before running the full dynamic-plugin fleet against an NFS shell, exercise a
small cohort that covers the main migration surfaces. The cohort is not meant
to predict the complete error taxonomy. It is meant to validate that the NFS
shell and Drydock can observe different kinds of breakage without turning
missing coverage into a green result.

The shell-only boot is a separate control and is not counted as one of the five
cases.

## Baseline rule

- Use the exact 1.53 RC2 image as the technical OFS control.
- Run the same backend, plugin artifacts, configuration, and provenance in the
  NFS candidate; change only the frontend shell/mode.
- Start with current artifacts unchanged. Do not pre-port the cohort before the
  first NFS run.
- A later controlled-fault round may seed one bounded defect per cohort case.

## Cohort

| Case | Surface represented | Candidate | What it should prove or expose |
| --- | --- | --- | --- |
| 1 | NFS-positive discovery | Kubernetes NFS sample using `@backstage/plugin-kubernetes/alpha` and feature discovery | The NFS shell can discover, register, configure, and render an actual alpha plugin. Its artifact/provenance must be confirmed before it becomes a DevPortal fleet target. |
| 2 | Entity extensions and legacy route conversion | `@veecode-platform/backstage-plugin-github-workflows` | Entity card/content blueprints, conditional filters, dynamic loading, and route-ref conversion. This is a valuable mixed specimen: source has an `alpha` entrypoint, while the current overlay still describes legacy `mountPoints`. |
| 3 | Page, navigation, module, translation, and API extensions | `devportal-marketplace-frontend` | Page and nav registration plus translation/API modules. The source has NFS blueprints, but its current package exports do not yet expose `./alpha`, so discovery/export failure is an expected risk to measure. |
| 4 | Theme/provider boundary | `veecode-platform-plugin-veecode-theme` | Theme provider migration from the current `themes`/DynamicRoot wiring to the NFS theme extension model. This is a shell-adjacent, high-leverage case. |
| 5 | Composed configuration contract | `github` + `github-auth` presets, including the GitHub Actions frontend artifact and static backend/auth/catalog configuration | Verify that multiple consumers share the merged GitHub integration and environment contract. `github-auth` is a configuration/preset scenario, not an isolated NFS frontend plugin. |

## Observations required per case

Each case needs an explicit expected surface and evidence for:

1. discovery or explicit registration;
2. frontend registration and boot;
3. the real user-facing surface (page, entity extension, theme, or config
   effect);
4. backend/API/config dependencies;
5. the final classification: working, broken, unsupported/out of coverage, or
   not observed.

An empty target set, absent alpha export, or unexercised surface must not be
reported as an R2 success. Drydock should emit an explicit coverage-gap or
migration result instead.

## Evidence basis

- `devportal-plugins/workspaces/kubernetes/packages/app/MIGRATION_STATUS.md`
  documents feature discovery through `/alpha`.
- `devportal-plugins/workspaces/github-workflows/plugins/github-workflows/src/alpha.ts`
  uses `createFrontendPlugin` and entity blueprints, while its overlay metadata
  still uses `mountPoints`.
- `devportal-plugins/workspaces/marketplace/plugins/devportal-marketplace-frontend/src/alpha/index.tsx`
  defines page, nav, translation, and API extensions; its package manifest
  currently lacks an explicit `./alpha` export.
- `devportal-plugins/workspaces/veecode-theme` and its overlay metadata still
  use the legacy theme configuration.
- `devportal-platform/presets/github.yaml` and `presets/github-auth.yaml`
  define the composed GitHub SCM/identity configuration. The former carries a
  dynamic GitHub Actions UI artifact; the latter has no dynamic plugin list.

## Exit condition

The cohort is useful only if the NFS run produces a truthful per-case result,
including explicit gaps, and the positive control proves that at least one
real NFS plugin is observable. After that, the unchanged full fleet can be
run and grouped by the failure classes discovered here.

## Gate 0.5 initial evidence

The first executable slice is a separate `app-next` package. The existing
OFS `packages/app` remains unchanged; `app-config.nfs.yaml` selects `app-next`
through `app.packageName: app-next` and enables `app.packages: all`. The shell
contains no manual plugin imports.

The NFS control dependency family is pinned to the versions used by the local
Backstage 1.53 Kubernetes sample:

- `@backstage/frontend-defaults`: `0.5.0`
- `@backstage/plugin-catalog`: `2.0.1`
- `@backstage/plugin-kubernetes`: `0.12.17`
- `@backstage/ui`: `0.13.1`

Evidence collected on 2026-07-28:

- `yarn workspace app-next tsc`: passed.
- `yarn workspace app-next build`: passed.
- `yarn dev-next`: frontend compiled; backend served `app-next/dist`;
  frontend returned HTTP 200 and backend health returned HTTP 200.
- Headless browser, guest sign-in, `/catalog`: rendered the catalog and listed
  five components without the earlier fatal `core.plugin-header-actions` API
  error.
- Headless browser, `/kubernetes`: resolved the Kubernetes route and rendered
  the plugin error boundary (`Entity context is not available`) rather than a
  missing-route result. This is positive discovery/registration evidence, but
  not yet proof of entity-page rendering.
- The NFS overlay now supplies a dedicated annotated fixture entity and a
  Kubernetes backend configuration with an empty config locator. The entity
  page exposed a `Kubernetes` tab, and
  `/catalog/default/component/nfs-kubernetes-control/kubernetes` rendered
  `Your Clusters` and `No Kubernetes resources` without a frontend exception.

The remaining limitation is intentional: the control has no real Kubernetes
cluster, so it proves NFS discovery, entity extension registration, routing,
and the backend contract, but not cluster connectivity or resource rendering.
