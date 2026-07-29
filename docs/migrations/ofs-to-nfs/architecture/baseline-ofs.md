# Current baseline — OFS runtime

Status: source-backed baseline as of 2026-07-29

## Runtime shape

The current DevPortal platform is an Old Frontend System application. The
frontend package `packages/app` renders the VeeCode/RHDH Scalprum and DynamicRoot
composition. Dynamic plugin behavior is assembled from runtime configuration and
legacy loader concepts such as `mountPoints`, `dynamicRoutes`, themes, icons and
translation resources.

The repository is on Backstage `1.53.0`, but that version bump did not change the
frontend system. A green 1.53 OFS run is therefore an OFS compatibility result,
not an NFS result.

The host contract is broader than the loader itself. The OFS app currently
owns the static route graph and VeeCode shell, custom API factories and auth
refs, catalog/scaffolder/TechDocs composition, application providers and
listeners, header mount points, branding and translation behavior. The exact
surface map is recorded in the [shell parity matrix](shell-parity-matrix.md).

## Backend and loading groundwork

The backend already contains a conditional Standard Module Federation path behind
`ENABLE_STANDARD_MODULE_FEDERATION`. That is useful transport groundwork, but it
does not make the current `packages/app` an NFS shell and does not prove that the
production image contains an NFS frontend package.

The current backend package points at the legacy `app` package by default. The
experimental local path adds `app-next` and selects it through
`app-config.nfs.yaml`; this path is intentionally separate from the OFS default.

The production configuration path still selects the OFS shell. The NFS arm is
currently a local development package and is not part of the production image
acceptance claim.

## Current Drydock coverage

The Drydock batch generator currently derives frontend targets from legacy
metadata fields: `mountPoints`, `entityTabs`, `dynamicRoutes` and `themes`. An
NFS-only plugin that has no legacy target can therefore boot without receiving a
real NFS probe target. That is a coverage boundary to fix, not evidence that the
plugin is healthy.

The reusable lifecycle remains valid: frozen fleet scope, isolated boot,
provenance, R0/R1, browser evidence, positive profiles, bounded repair,
re-verification and human checkpoints.

## Local NFS experiment already observed

The local development slice created an `app-next` package and selected it with
`app-config.nfs.yaml`. It passed typecheck and build, served the frontend and
backend, rendered the catalog, discovered the Kubernetes alpha plugin and
rendered a Kubernetes entity route using a fixture entity.

This evidence is useful for Gate 0 and Gate 1 only. It does not establish:

- a production NFS image;
- a real VeeCode NFS dynamic artifact;
- a live Kubernetes cluster connection;
- complete VeeCode shell parity;
- full-fleet NFS readiness.

## Version and artifact baseline

`backstage.json` reports `1.53.0`, while the frozen inventory found 11 optional
OCI references in presets that still contain the literal `bs_1.49.4` tag.
Other optional references use `${BACKSTAGE_VERSION}` and the core packages are
pre-installed/local names. The entrypoint expands the placeholder form but does
not rewrite the literal old tag. Artifact identity and digest must therefore be
resolved per selected package before any compatibility or migration claim.

## Source references

- [Initial OFS → NFS investigation](../research/2026-07-28-ofs-nfs-initial.md)
- [NFS control cohort](../research/2026-07-28-ofs-nfs-control-cohort.md)
- [Fleet inventory](../inventory/fleet-inventory.md)
- [Drydock mechanism and NFS boundary](../../../../../veecode-drydock/findings/31-drydock-mechanism-and-nfs-boundary.md)
- [`packages/app/src/App.tsx`](../../../../packages/app/src/App.tsx)
- [`packages/backend/src/index.ts`](../../../../packages/backend/src/index.ts)
