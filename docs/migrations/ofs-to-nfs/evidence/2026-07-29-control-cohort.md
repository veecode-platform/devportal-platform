# Gate 0.5 control cohort — evidence snapshot

**Date:** 2026-07-29
**Status:** historical pre-runtime snapshot; superseded for current execution
by [the executable NFS checkpoint](2026-07-29-nfs-executable-control-cohort.md)
**Scope:** provenance, artifact resolution and Drydock target-planning boundary
**Containers started:** no
**Production state changed:** no

## Executive result

The current Drydock checkout is not a blocker for this investigation. It is
clean on `main` at `163aa4825223f609fce352e72c9646904f4fa327`, and the current
batch scripts are unchanged. The work in progress can continue independently
as long as a future runtime claim records the exact Drydock commit.

The five-case cohort is not yet an executable NFS cohort. The evidence proves
that the selected `bs_1.53.0` OCI references exist and that the current OFS
planner can produce legacy targets for four workspaces. It does **not** prove
that those artifacts expose usable NFS entrypoints in the published layers or
that a VeeCode NFS shell can discover, load and render them.

The immediate blocker is architectural, not a Drydock worktree conflict:

1. `app-next` is a local NFS reference shell and is not part of the production
   image acceptance path.
2. The current DevPortal backend still loads the legacy dynamic-plugin path by
   default; Standard Module Federation is conditional groundwork, not an NFS
   runtime by itself.
3. Drydock's batch generator derives frontend targets from OFS fields
   (`mountPoints`, `entityTabs`, `dynamicRoutes` and `themes`). It has no NFS
   discovery/claim path yet.

## Repository snapshot

| Repository | Branch/status at capture | HEAD | Relevance |
| --- | --- | --- | --- |
| `devportal-platform` | `main`; local migration work modified/untracked | `de67ba3166def46554f785033b4fe3834822fa77` | Host, experimental `app-next`, configs and migration docs |
| `veecode-drydock` | `main`; clean | `163aa4825223f609fce352e72c9646904f4fa327` | Lifecycle, batch planner and future NFS-aware verification |
| `devportal-plugin-export-overlays` | `main`; behind `origin/main` by 6 | `19d46fbad8c37bd78ad317ccc929d01994f0528f` | Artifact metadata and generated legacy config |
| `devportal-plugins` | `main`; untracked `codedb.snapshot` | `5b5c7076dea7ae9d9e95b1085f7c6062086c7c18` | Local source inspection for NFS entrypoints |

The platform worktree currently contains the expected local migration changes
(`app-next`, `app-config.nfs.yaml`, package manifests/lockfile and
`docs/migrations/`). No worktree was reset, rebased or overwritten.

## Artifact resolution

The following read-only registry checks resolved the candidate references on
2026-07-29. A config/layer digest proves that the registry object exists; it
does not prove that the selected package contains `./alpha` or that its NFS
surface works.

| Reference | Config digest | Layer digest |
| --- | --- | --- |
| `quay.io/veecode/github:bs_1.53.0` | `sha256:c75e60419fd6c0842163427d8cc4b00fb90f2f0a5c3084739667f91b949526c3` | `sha256:0deeb96f9e6ed3571961eecb898d54cb31816e9a58cfb2a1a33ba963e584b` |
| `quay.io/veecode/github-workflows:bs_1.53.0` | `sha256:ecf172643a31d493f5581d0b85b8f0e4481f5fda9af555ed94fd7f3806c737` | `sha256:2fc980322dd2b1aaea28efb19efa3b852aeead462d15335ae39c35242a404f2f` |
| `quay.io/veecode/marketplace:bs_1.53.0` | `sha256:f4d87c2ae02daa5682078c81e7b79a0f802b9462319c52fd8b8b49e888213cca` | `sha256:2939047255185598683fd68cdf986542b638fd8f650396aa31cf67fbb954e03a` |
| `quay.io/veecode/veecode-theme:bs_1.53.0` | `sha256:37986ada06839da2fe857561a31f737c7cc7bc7bbfe3374ca4cbb195c8e35c2b` | `sha256:5c269ed66f2c953ed9f54614934ba44c06f85b24b44ffd8720f2d620fe4a672b` |

The candidate platform tag `veecode/devportal:2.3.0-rc.2` also resolved as a
multi-architecture manifest. Its amd64 platform descriptor was
`sha256:0ecd25c5a0e744f3988b3cd149c532e494b3e2ffe6f535a24cdad2ab278ccc64`.
No container was started from it in this slice.

## Source and metadata provenance

The metadata is not yet a clean 1.53 provenance line:

| Case | Overlay source provenance | Metadata support claim | Artifact tag |
| --- | --- | --- | --- |
| `github-workflows` | `f3f95e06510863272006e3b305516509df4166df`; source Backstage `1.49.2` | `1.49.4` | `bs_1.53.0` |
| Marketplace | `23f538f55731a887391241d8444af2586205a600`; source Backstage `1.49.4` | `1.49.4` | `bs_1.53.0` |
| VeeCode theme | `f3f95e06510863272006e3b305516509df4166df`; source Backstage `1.49.4` | `1.49.4` | `bs_1.53.0` |
| GitHub | `97599a21566d6bc91a55555e271770b24ad91679`; source Backstage `1.49.2` | `1.49.4` | `bs_1.53.0` |

This is a provenance risk to resolve before calling any published artifact
`artifact-ready`. The `bs_1.53.0` tag alone is not evidence that the source,
metadata, package export and runtime contract are aligned.

## Cohort observations

### 1. Kubernetes — positive NFS reference

The local `app-next` slice compiled, booted and served the NFS reference shell.
The browser evidence showed Kubernetes route discovery, a Kubernetes entity
tab for the annotated fixture `nfs-kubernetes-control`, and the entity route
rendering `Your Clusters` / `No Kubernetes resources` without a frontend
exception.

This is `runtime-verified` for NFS discovery, registration and the empty
backend contract only. There is no live cluster, no VeeCode OCI artifact and
no Drydock batch report for this case. It is therefore a shell/reference
control, not yet a fleet readiness result.

### 2. `github-workflows` — mixed OFS/NFS entity extension

Source inspection found an `./alpha` entrypoint using `createFrontendPlugin`,
entity blueprints and route-ref conversion. The overlay metadata still
describes the legacy entity mount.

Running the current planner with
`BUNDLE_TAG_OVERRIDE=bs_1.53.0` generated a plan for
`@veecode-platform/backstage-plugin-github-workflows` and one OFS target:
`entity.page.overview/cards` (`EntityGithubWorkflowsCard`). That is useful
OFS planning evidence, but it is not an NFS target claim. No VeeCode NFS
artifact was loaded by `app-next`.

Initial status: `source-ready`; NFS artifact/runtime unverified.

### 3. Marketplace — page/navigation/module/translation surface

Source inspection found NFS declarations for page, navigation, translation and
API extensions. The current package manifest does not expose an explicit
`./alpha` export, while the overlay still describes legacy routes. The 1.53
artifact reference exists.

The current planner emitted legacy targets for the Marketplace route
(`dynamicRoutes:/marketplace`) and the pending-changes global header. These
targets do not establish that the NFS declarations are discoverable.

Initial status: `blocked` pending the package export/discovery decision.

### 4. VeeCode theme — theme/provider boundary

The current overlay describes the light/dark themes through the OFS `themes`
field. The source audit did not find a usable NFS alpha export for the theme,
and the current planner emitted one legacy theme target. The 1.53 artifact
reference exists, but its NFS surface has not been inspected or exercised.

Initial status: `requires-port`.

### 5. GitHub + `github-auth` — composed configuration scenario

The GitHub workspace resolved the 1.53 artifact reference and generated legacy
plans for the GitHub Actions, deployments, discussions and pull-request-board
surfaces, plus the backend module. `github-auth` remains a configuration-only
preset: it contributes identity/catalog configuration and has no isolated
frontend artifact.

This case must be tested as one composed contract: merged GitHub integration,
authentication and catalog configuration, together with the GitHub Actions
frontend surface. No NFS runtime was exercised, so shared configuration has
not yet been proven in the NFS arm.

Initial status: `config-scenario`; frontend and composed-runtime result pending.

## What this slice proves

- the selected four OCI bundle repositories have resolvable `bs_1.53.0`
  objects;
- the current OFS batch planner can turn their legacy metadata into plans;
- the NFS reference shell can discover and render a fixture-backed Kubernetes
  extension;
- Drydock's lifecycle/provenance machinery is conceptually reusable for NFS;
- the current Drydock checkout is clean and can continue evolving in parallel.

## What this slice does not prove

- that any VeeCode published bundle contains a usable NFS entrypoint;
- that the production image contains or selects an NFS shell;
- that Standard Module Federation is wired end-to-end for VeeCode artifacts;
- that any of the four VeeCode cases renders in NFS;
- that shared GitHub/GitHub-auth configuration works in NFS;
- that the five-case cohort or the full fleet is migration-ready.

## Required next executable slice

The next runtime run should keep the cohort artifacts and configuration
unchanged and change only the frontend arm/mode. Before that run, Drydock needs
an explicit NFS target/claim path that can represent:

1. discovered NFS entrypoints and blueprints;
2. a coverage gap when an NFS surface exists but no probe knows how to assert it;
3. a configuration-only composed scenario such as `github` + `github-auth`;
4. the selected mode (`nfs`) in every report; and
5. the same provenance and human merge/promotion checkpoints already used by
   the existing lifecycle.

Until those pieces exist, work on Drydock is not a problem; running the current
batch and labelling its result as NFS would be the problem.
