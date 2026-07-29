# OFS-NFS-D-005 — Drydock follows the OFS → NFS migration cycle

Status: accepted direction

Drydock is not only a classifier for the migration. Its role is to follow each
declared plugin through the OFS → NFS lifecycle: identify the current surface,
support a bounded migration or repair, verify the NFS target at runtime,
reverify the result with controlled evidence, and escalate what cannot be
closed. The existing provenance, fleet scope, worklist, repair limits, positive
profiles, controlled A/B and human checkpoints remain the foundation; NFS adds a
new target and claim model rather than a separate quality universe.

## Consequences

- The first Drydock NFS slice must prove one real plugin through the same
  follow-through lifecycle, not merely boot an `app-next` shell.
- The harness must discover or receive NFS extension claims instead of assuming
  that `mountPoints` and `dynamicRoutes` are the complete target set.
- A missing NFS target becomes an explicit coverage result, never a green empty
  probe.
- The exact implementation boundary between `app-next` and a future `nfs-port`
  module remains a follow-up design item.
