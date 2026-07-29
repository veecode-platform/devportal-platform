# Migration modes and gates

Status: proposed execution contract

## Modes

| Mode | Frontend arm | Loading substrate | Intended use |
| --- | --- | --- | --- |
| `ofs` | `packages/app` | Scalprum / DynamicRoot | Current production behavior and OFS control |
| `nfs` | `app-next` or final NFS package | Standard Module Federation / NFS extension graph | NFS shell and migrated-plugin verification |
| `ab` | Both arms under controlled comparison | Mode-specific | Same subject, config, entity, profile and provenance; compare the claims produced by each arm |

The modes are explicit. A result from `ofs` cannot be used as evidence for
`nfs`, and a result from `nfs` must not be presented as proof that the legacy
fleet remains unchanged.

## Constraint from the target review

The first two gates validate the NFS substrate, not the VeeCode shell:

- Gate 0 proves that an NFS frontend package can build, start and be selected.
- Gate 1 proves that a stock NFS reference plugin can be discovered and render
  a bounded surface.

Neither gate proves parity for VeeCode authentication, branding, global
headers, custom routes, APIs, scaffolder, TechDocs, settings or the legacy
DynamicRoot contract. Those surfaces are tracked in the
[shell parity matrix](../architecture/shell-parity-matrix.md). Until the
required parity floor is defined, Gate 2 results must state whether they ran
against the stock NFS shell or a VeeCode shell slice; they must not be
described as full DevPortal NFS readiness.

## Gate sequence

### Gate 0 — NFS shell boot

Question: does the NFS arm compile, start and serve the backend-selected app?

Required evidence:

- frontend typecheck and build;
- backend readiness;
- app package selected by configuration;
- exact image/config commit when containerized.

The local `app-next` experiment has passed this gate as a development slice.
It is not a production-image graduation.

### Gate 1 — NFS positive reference

Question: can the NFS shell discover and render one known NFS plugin without
manual shell wiring?

The Kubernetes alpha plugin is the reference control. The current fixture
proved discovery, entity extension registration and the Kubernetes route in a
local shell without a real cluster. Cluster connectivity remains outside this
gate.

### Gate 2 — VeeCode plugin slice

Question: can one real VeeCode dynamic plugin enter the NFS runtime and render
an attributable user-facing surface?

The first candidate is `github-workflows`, because its source already contains
an NFS alpha entrypoint while its overlay still describes OFS mount points.
The result must bind source, package, artifact, shell mode and positive runtime
assertion.

The evidence must also name the shell profile used. A VeeCode plugin rendered
inside the minimal `app-next` experiment proves a plugin/runtime slice, not
that the current `packages/app` host behavior has been ported.

### Gate 3 — Controlled A/B and Drydock lifecycle

Question: can the same subject traverse the existing Drydock lifecycle with an
NFS claim?

The slice must include a real positive assertion, one bounded observable defect
when safe, repair or escalation, re-verification and a human evidence
checkpoint. A shell boot alone does not pass this gate.

### Gate 4 — Five-case control cohort

Question: does the observation model cover the main migration surfaces before
we touch the complete fleet?

The cohort is documented in
[`research/2026-07-28-ofs-nfs-control-cohort.md`](../research/2026-07-28-ofs-nfs-control-cohort.md).
Each case must produce a truthful result, including explicit unsupported or
coverage-gap outcomes.

### Gate 5 — Full-fleet NFS census

Question: what is the unchanged fleet's actual NFS readiness and failure shape?

Run the declared fleet against the NFS arm before pre-porting it. Group the
observed failures, then select repair exemplars by class. An absent NFS target
is a coverage result, not a green empty probe.

### Gate 6 — Cutover recommendation

Question: is there enough evidence to recommend changing the default arm?

This gate requires shell parity decisions, fleet results, named residuals,
rollback behavior, exact image/artifact provenance and an explicit human
decision. It is not implied by passing Gates 0–5 individually.

## Universal evidence rules

- Every run records `mode`, target image digest, relevant commits, artifact
  digests, configuration, entity fixture and probe profile.
- Every declared subject receives a report or an explicit `NO-REPORT` blocker.
- Empty target sets, absent alpha exports and unexercised surfaces are never
  reported as runtime success.
- `R2-PASS-WEAK` is not equivalent to NFS readiness.
- Merge and production promotion remain human actions.
