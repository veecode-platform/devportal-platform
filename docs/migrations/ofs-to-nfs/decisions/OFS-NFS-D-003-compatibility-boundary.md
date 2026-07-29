# OFS-NFS-D-003 — Use compatibility helpers tactically, not as the migration strategy

Status: accepted

`@backstage/core-compat-api` remains useful for bounded plugin conversion and
for third-party compatibility where a dual export is valuable. It is not the
strategy for the VeeCode shell: the current application assembles a custom
Scalprum root after remote configuration is loaded, so the conventional
`convertLegacyAppRoot` path does not model the real boundary. The NFS arm must
declare and load NFS extensions directly; compatibility must not become a
permanent hybrid shell.

## Consequences

- The stock NFS app shape is the reference for the new arm.
- VeeCode-owned shell behavior is ported deliberately as NFS extensions or
  explicitly retired, rather than wrapped wholesale.
- Third-party plugins may temporarily carry OFS and NFS exports, but the NFS arm
  must not silently route legacy-only plugins through an unbounded compatibility
  layer.
