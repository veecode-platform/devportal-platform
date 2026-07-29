# OFS-NFS-D-004 — Apply an all-in moderate fleet policy

Status: accepted

The migration is all-in with respect to lifecycle coverage, not a promise that
every plugin will be autonomously repaired or reach the same runtime rung. Every
declared fleet member enters the migration/census scope and receives an explicit
result: working, broken, unsupported, coverage gap, or human escalation. No
member may disappear because the current harness cannot observe its NFS surface.

Known non-blocking limitations may remain when they are named and bounded. Missing
reports, unknown mode, absent evidence and silently unprobed surfaces are
blocking conditions. Merge and production promotion remain human decisions.

## Consequences

- The gate measures truthful follow-through, not a binary “all plugins green”.
- NFS-only plugins require an explicit Drydock coverage result until their real
  surface is probeable.
- A plugin can finish at its verified ceiling or an explicit escalation without
  being misreported as universally R2-confirmed.
