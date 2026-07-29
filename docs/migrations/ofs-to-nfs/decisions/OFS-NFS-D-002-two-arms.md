# OFS-NFS-D-002 — Transition through two frontend arms

Status: accepted

The migration will preserve the existing OFS arm while introducing a separately
verifiable NFS arm. The OFS arm (`packages/app`) remains the safe/default path
for the current fleet; the NFS arm (`app-next` or its eventual production
packaging) accepts only plugins and shell behavior that have been proven in the
NFS runtime. The arms may share the backend and image during transition, but
their frontend loading modes and coverage claims remain explicit.

## Consequences

- The legacy fleet can continue operating while the NFS subset is migrated.
- A plugin may be NFS-ready without forcing an immediate fleet-wide cutover.
- A transition test must identify the selected arm; “hybrid” must not hide which
  runtime actually produced the evidence.
- The existence of an experimental `app-next` package is not, by itself, proof
  that the production image contains a supported NFS arm.
