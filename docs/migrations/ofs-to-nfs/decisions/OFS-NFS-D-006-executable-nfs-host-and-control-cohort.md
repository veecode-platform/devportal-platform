# OFS-NFS-D-006 — Executable NFS host and control cohort

Status: accepted for the first executable slice

Date: 2026-07-29

## Context

The migration needs an executable NFS arm before any VeeCode shell or plugin
port is attempted. The target is Backstage `1.53.0`; the first host is the
minimal `app-next` shell. The existing OFS Dockerfile and runtime remain the
control arm and must not be changed as part of this slice.

The five-case cohort is deliberately a control measurement, not a readiness
percentage. It must run with the current published artifacts and current
overlay metadata, so that missing NFS declarations, configuration-only
scenarios and real runtime defects remain distinguishable.

## Decision

1. `app-next` uses `@backstage/frontend-dynamic-feature-loader@0.1.14` and
   configures `dynamicFrontendFeaturesLoader()` through `createApp()`. Its
   static frontend discovery is explicitly limited by `app-config.nfs.yaml` to
   `@backstage/plugin-catalog`, a host capability used by the current OFS
   catalog route. This is not a wholesale port of the OFS shell's static route
   dependencies: the legacy internal plugin, VeeCode branding, header, theme
   and navigation remain outside this slice. Kubernetes is not a host
   dependency; Gate 1 loads the current Kubernetes artifact as a dynamic
   remote.
2. The NFS image is built through the separate `Dockerfile.nfs` and
   `scripts/build-local-nfs-image.sh` path. It packages the compiled
   `packages/app-next/dist`, includes `app-config.nfs.yaml`, enables
   `ENABLE_STANDARD_MODULE_FEDERATION`, and selects `app-next` explicitly.
   The path is local/CI-only for this decision: it creates a versioned local
   tag, does not push, and does not move `latest` or another protected pointer.
3. Gate 1 uses the Kubernetes reference as a static catalog fixture and mounts
   the current Kubernetes OCI artifact as the positive dynamic-plugin control.
   The browser evidence must show the Kubernetes remote advertised and loaded,
   while the static discovery list must contain catalog and exclude Kubernetes.
   A live Kubernetes cluster is not required for Gate 1 and is not claimed by
   it.
4. The cohort runs in Drydock `nfs` mode against the unchanged current
   artifacts. No pre-porting, normalizer, revision, Factory repair or
   automatic repair is part of the measurement. Each case receives one of
   `runtime-verified`, `broken`, `requires-port`, `config-scenario` or
   `coverage-gap`.
5. The raw Drydock report, container logs and manual browser evidence are all
   retained. A harness coverage result is not rewritten as a plugin failure,
   and an `R1-OK` row with an NFS coverage cause is not treated as NFS
   readiness.
6. The cohort ends at a human evidence checkpoint. Merge, publication,
   promotion and repair selection remain human actions.

## Consequences

- The NFS substrate is independently buildable, selectable and observable
  without changing OFS.
- The backend bundle remains a shared build input and can physically contain
  `app-next` for the unchanged OFS Dockerfile; this is a known artifact-size
  coupling, not activation of the NFS host in OFS. Full artifact separation is
  deferred to a separate slice.
- The NFS host does not inherit `app.packages: all`: adding a frontend package
  to `app-next` alone is not permission to make it host-static. The explicit
  `app.packages.include` list is the reviewable boundary for the small static
  host subset; other frontend features remain dynamic.
- Gate 1 proves that a reference plugin can be advertised, loaded and rendered
  as a remote in the minimal shell; the browser also proves that Kubernetes is
  absent from the host's static discovery list. It does not prove VeeCode shell
  parity or cluster connectivity.
- The current cohort exposes the real migration boundary. Existing metadata
  still describes OFS mount points/themes and does not declare the NFS
  composition consumed by the host. Four cases therefore remain coverage or
  porting work, while the GitHub plus `github-auth` case remains a composed
  configuration scenario.
- The initial image and browser artifacts are local evidence only. This
  decision does not graduate the NFS arm to production or authorize an image
  publication.

## Evidence

The execution record, image digest, exact raw matrix and case classifications
are frozen in
[`2026-07-29-nfs-executable-control-cohort.md`](../evidence/2026-07-29-nfs-executable-control-cohort.md).
