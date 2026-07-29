# OFS-NFS-D-001 — Treat the Backstage bump and OFS → NFS as independent axes

Status: accepted

The Backstage 1.49.4 → 1.53.0 version bump does not, by itself, migrate the
DevPortal from the Old Frontend System to the New Frontend System. The current
runtime remains an OFS/Scalprum application until the frontend shell and its
plugin loading substrate are deliberately changed. Therefore version-bump
verification and NFS migration are related workstreams, but neither is evidence
that the other has happened.

## Consequences

- A green Backstage 1.53 OFS run is not an NFS readiness result.
- NFS work gets its own target runtime, evidence and gates.
- Drydock must record the frontend-system mode alongside the Backstage version.
