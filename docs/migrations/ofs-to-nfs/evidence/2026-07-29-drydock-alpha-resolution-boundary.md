# Drydock and `/alpha` resolution boundary

**Date:** 2026-07-29
**Status:** source investigation complete; no runtime NFS claim
**Scope:** read-only inspection of `devportal-platform`, `veecode-drydock`,
`devportal-plugin-export-overlays`, and `devportal-plugins`

## Executive finding

There is a deterministic `/alpha` mechanism in the NFS application path, but it
is not currently implemented by Drydock.

The mechanism is split across two layers:

1. The NFS host enables feature discovery with `app.packages: all`. The
   Backstage CLI compilation step discovers compatible dependency features and
   exposes them to `createApp`; the app then installs the discovered features.
2. The legacy overlay/export path carries a Scalprum exposed module named
   `alpha` and the smoke workflow accepts a runtime unpack path ending in
   `/alpha`.

Neither layer currently makes Drydock inspect the selected package's
`package.json`, prove `exports["./alpha"]` in the published OCI package, and
derive an NFS runtime target from that fact.

This means the earlier wording “make Drydock recognize and test a plugin loaded
by NFS” was too broad as a first description. The missing work is not to invent
another `/alpha` selector in the host. It is to give Drydock an NFS-aware
artifact/claim boundary and an NFS runtime observation path.

## Evidence

### 1. The NFS host already has deterministic feature discovery

The local NFS arm is deliberately minimal:

- [`app-config.nfs.yaml`](../../../../app-config.nfs.yaml) selects
  `app-next` and sets `app.packages: all`.
- [`packages/app-next/src/App.tsx`](../../../../packages/app-next/src/App.tsx)
  calls `createApp()` and `app.createRoot()` without manually importing a
  plugin.
- The Backstage 1.53 source for
  [`packages/frontend-defaults/src/discovery.ts`](https://github.com/backstage/backstage/blob/v1.53.0/packages/frontend-defaults/src/discovery.ts)
  reads `app.packages`, obtains the compilation-generated
  `window.__@backstage/discovered__` module list, applies include/exclude
  filters, and installs valid frontend features.
- Backstage's app documentation says that feature discovery is wired into the
  `@backstage/cli` compilation process by scanning compatible dependencies:
  [`Feature Discovery`](https://backstage.io/docs/frontend-system/architecture/app/#feature-discovery).

The local Kubernetes control documents the resulting contract explicitly:
`packages: all` discovers packages with `/alpha` exports and loads the alpha
feature without a manual import. The control source and config are in
[`devportal-plugins/workspaces/kubernetes/packages/app/`](https://github.com/veecode-platform/devportal-plugins/tree/5b5c7076dea7ae9d9e95b1085f7c6062086c7c18/workspaces/kubernetes/packages/app/).

Important distinction: `app.packages: all` is a host/build discovery policy;
it is not a Drydock probe policy, and it does not by itself prove that a VeeCode
OCI artifact contains the expected NFS entrypoint.

There is a second boundary in the current local experiment: [`app-next/package.json`](../../../../packages/app-next/package.json)
currently depends on the static Kubernetes control packages, but not on
`@backstage/frontend-dynamic-feature-loader`. [`packages/backend/src/index.ts`](../../../../packages/backend/src/index.ts#L111-L130)
only exposes the Standard Module Federation service when
`ENABLE_STANDARD_MODULE_FEDERATION=true`.
Therefore this discovery proof covers statically compiled NFS dependencies; it
does not yet prove that an OCI dynamic-plugin fleet can be discovered and loaded
by the VeeCode NFS arm.

### 2. The overlays already carry a legacy `alpha` module path

The overlays repository contains two related, but different, pieces:

- [`workspaces/github/plugins/github-actions/scalprum-config.json`](https://github.com/veecode-platform/devportal-plugin-export-overlays/blob/be45e5223033d41909ff605171aa2a17c339cdb5/workspaces/github/plugins/github-actions/scalprum-config.json)
  declares the Scalprum exposed module `alpha: ./src/alpha.ts`.
- [`export-dynamic/export-dynamic.sh`](https://github.com/veecode-platform/devportal-plugin-export-utils/blob/de59cd2b2caabb92f8dc5845cf20be8e2c91c1df/export-dynamic/export-dynamic.sh)
  passes that optional Scalprum config to the dynamic export CLI.
- [`run-workspace-smoke-tests.yaml`](https://github.com/veecode-platform/devportal-plugin-export-overlays/blob/be45e5223033d41909ff605171aa2a17c339cdb5/.github/workflows/run-workspace-smoke-tests.yaml)
  accepts either the unpack path `<plugin>` or `<plugin>/alpha` when matching
  the canonical “loaded dynamic plugin” log line. This came from commit
  `da6ebd1f` (`fix(smoketest): avoid false negatives for /alpha plugin loads`).

This is evidence that the published legacy dynamic-plugin path may load an
alpha-named Scalprum module. It is not evidence that the NFS package export
`exports["./alpha"]` was selected or that an NFS feature was registered.

### 3. Drydock's deterministic bundle inspection is still OFS-shaped

The current Drydock `main` is clean at `163aa482`.

[`harness/normalizer/bundle-facts.cjs`](https://github.com/veecode-platform/veecode-drydock/blob/163aa4825223f609fce352e72c9646904f4fa327/harness/normalizer/bundle-facts.cjs)
extracts four facts from the selected OCI package:

- `dist-scalprum/plugin-manifest.json`;
- `dist-scalprum/configSchema.json`;
- `src/index.ts` or `src/index.tsx`;
- the README head.

It does not read the package's `package.json`, inspect `exports["./alpha"]`,
or inspect an NFS feature's default export.

[`harness/batch/gen-config.cjs`](https://github.com/veecode-platform/veecode-drydock/blob/163aa4825223f609fce352e72c9646904f4fa327/harness/batch/gen-config.cjs)
derives frontend targets only from legacy metadata fields: `mountPoints`,
`entityTabs`, `dynamicRoutes`, and `themes`. The target planner never changes
the selected OCI selector to `/alpha`.

When no legacy target is generated, [`harness/batch/probe-r2.cjs`](https://github.com/veecode-platform/veecode-drydock/blob/163aa4825223f609fce352e72c9646904f4fa327/harness/batch/probe-r2.cjs)
returns an empty result set successfully. The report then distinguishes some
deferred surfaces, but a plugin whose real surface exists only in NFS is not
rendered or attributed by the current R2 path. This boundary is already
recorded in [`findings/31-drydock-mechanism-and-nfs-boundary.md`](https://github.com/veecode-platform/veecode-drydock/blob/163aa4825223f609fce352e72c9646904f4fa327/findings/31-drydock-mechanism-and-nfs-boundary.md).

### 4. The current cohort evidence does not claim otherwise

The Gate 0.5 cohort notes are consistent with this boundary:

- Kubernetes proves the local NFS shell's discovery and entity extension using
  a reference control, not a VeeCode OCI artifact.
- `github-workflows` has source-level `./alpha` and blueprints, but the
  current planner still emits an OFS `mountPoints` target.
- Marketplace has NFS source declarations but no explicit `./alpha` package
  export and remains blocked on the export/discovery decision.

See [`2026-07-28-ofs-nfs-control-cohort.md`](../research/2026-07-28-ofs-nfs-control-cohort.md)
and [`2026-07-29-control-cohort.md`](2026-07-29-control-cohort.md).

## Corrected conclusion

The user-facing statement “the target plugin has `/alpha`, so NFS uses it” is
true only after the complete chain is present:

```text
published package exports ./alpha
        ↓
Backstage CLI / module-federation discovery exposes the feature
        ↓
NFS host loads the feature under app.packages
        ↓
the feature registers observable extensions
        ↓
Drydock attributes a runtime claim to the package
```

Today, the host-discovery portion of the first three steps is represented in
source/config controls for the statically compiled Kubernetes reference. It is
not yet a proven OCI dynamic-plugin path. The fourth is proven only for that
local reference, and the fifth does not exist in Drydock yet. The overlay
`/alpha` smoke matcher is a separate OFS false-negative fix.

## What this changes in the plan

We should not create a new generic “Drydock `/alpha` selector” based on log
matching. The next implementation seam, after the first real NFS runtime
control, should be:

1. deterministic artifact fact extraction: read the selected package's
   published `package.json` and verify that `exports["./alpha"]` resolves to a
   file present in the artifact;
2. an explicit `observedMode: nfs` plan/claim, separate from OFS
   `mountPoints`/`dynamicRoutes` targets;
3. an NFS host/runtime assertion that names the discovered plugin and at least
   one registered extension;
4. a loud `coverage-gap` result when an NFS plugin loads but no truthful user
   surface can be observed.

The first item is deterministic and cheap. It is the likely small change the
user remembered. It is not present in the current Drydock checkout, so it must
be reintroduced only after confirming the exact artifact layout used by the
VeeCode NFS arm.

## Limits of this investigation

- No container was started in this slice.
- No VeeCode OCI artifact was loaded by `app-next` in this slice.
- Source-level `./alpha` presence was not promoted to `artifact-ready` or
  `runtime-verified`.
- No file in Drydock or overlays was modified by the investigation; platform
  code/config was not changed. This note is the only investigation artifact
  added here.
