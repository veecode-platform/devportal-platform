# OFS-NFS-D-007 — nfs/next durable branch and publish gate

Status: accepted for the NFS migration channel

Date: 2026-08-05

## Context

The NFS arm is developed across many short-lived `feat/nfs-*` branches with no
durable trunk of its own. Every image build today requires a manual dispatch
that types an immutable tag by hand, and no branch records the accumulated
state of the migration. A publish to the shared `docker.io/veecode/devportal`
repository must never move `:latest` or `:stable`, which production OFS
consumers depend on. GitHub branch protection is unavailable because the
`veecode-platform` organization is on the free plan; only workflow-level CI and
process discipline can gate the channel.

## Decision

1. A durable branch `nfs/next` becomes the single NFS trunk. All NFS work
   merges to it via pull request and review. `main` receives NFS work only when
   the migration is approved for cutover.
2. `nfs/next` is created from the current `main` (`4894fce`) with a clean
   baseline. It carries the executable host and Dockerfile.nfs path; plugin
   artifacts continue to be produced by the overlays and consumed by digest.
3. Pushes to `nfs/next` build and validate continuously (`pr-check.yml` gains
   `nfs/next` in its branch list). Publishing is manual and gated: a
   workflow_dispatch input `publish` (default `false`) decides whether the
   build result is pushed to the registry.
4. The published image receives two tags for the same digest: an immutable
   `2.3.0-rc.2-nfs.<shortsha>` tag (evidence) and a moving `:next` convenience
   tag (sandbox/bench consumption). `:next` is never produced from any other
   ref. `:latest` and `:stable` remain forbidden; pre-release semantics in
   publish.yml already keep `:latest` untouched.
5. Consumers of `:next` are internal only (local bench and CI). No external
   sandbox consumes it in this decision.
6. Because branch protection is unavailable on the free plan, the channel is
   governed by process: PR + review for every merge, CI as the technical
   lever, and manual publish as the only registry write.

## Consequences

- The migration gains a reviewable, durable trunk and a stable place for
  future NFS work to land.
- A regression can be reverted by reverting a merge to `nfs/next`, and the
  published `:next` can be re-pointed only by a new merge (never out-of-band).
- `main` stays OFS-only until cutover; `:latest` remains protected by design.
- The free-plan limitation means enforcement is procedural, not technical:
  the ADR and the PR-review convention are the guardrails, with pr-check as
  the automated one.
