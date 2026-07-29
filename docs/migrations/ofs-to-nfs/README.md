# OFS → NFS migration

Status: decision baseline recorded; implementation in progress

This directory is the canonical documentation boundary for the VeeCode
DevPortal migration from the Old Frontend System (OFS) to the New Frontend
System (NFS). Migration-specific decisions live in `decisions/`; research,
plans, gates, runbooks and evidence must remain distinguishable from those
decisions.

## Authority model

- `decisions/` contains accepted migration decisions and their consequences.
- `research/` contains source-backed investigation; it is not normative.
- `architecture/` describes the current OFS baseline and the intended NFS
  target without silently turning gaps into decisions.
- `inventory/` tracks shell, plugin, artifact and readiness coverage.
- `gates/` defines what must be proven before advancing.
- `runbooks/` contains executable procedures.
- `evidence/` contains immutable run outputs and links to exact commits,
  images, artifacts and digests.
- `glossary.md` defines migration vocabulary so that readiness, coverage and
  parity claims are not overloaded.
- `open-questions.md` records unresolved questions without promoting them to
  decisions.

The Obsidian vault is a cross-repository index and continuity layer. It may
point here, but it is not a second source of truth for the current decision
state.

## Current position

- Backstage 1.49.4 → 1.53.0 and OFS → NFS are independent axes.
- The current DevPortal runtime and plugin fleet are OFS-shaped.
- The migration target is a separately verifiable NFS arm, while the legacy
  arm remains available during transition.
- `core-compat-api` is not the migration strategy for the custom Scalprum
  shell.
- Drydock must follow every declared fleet member through an explicit
  lifecycle, including coverage gaps and human escalations.

The current exploratory evidence is recorded in
[`research/2026-07-28-ofs-nfs-initial.md`](research/2026-07-28-ofs-nfs-initial.md),
the control cohort in
[`research/2026-07-28-ofs-nfs-control-cohort.md`](research/2026-07-28-ofs-nfs-control-cohort.md),
and the Drydock boundary in
[`veecode-drydock/findings/31-drydock-mechanism-and-nfs-boundary.md`](../../../../veecode-drydock/findings/31-drydock-mechanism-and-nfs-boundary.md).

## Decision register

| ID | Decision | Status |
| --- | --- | --- |
| [OFS-NFS-D-001](decisions/OFS-NFS-D-001-independent-axes.md) | Backstage bump and OFS → NFS are independent axes | Accepted |
| [OFS-NFS-D-002](decisions/OFS-NFS-D-002-two-arms.md) | Transition through an OFS arm and an NFS arm | Accepted |
| [OFS-NFS-D-003](decisions/OFS-NFS-D-003-compatibility-boundary.md) | Compatibility helpers are a tactical boundary, not the strategy | Accepted |
| [OFS-NFS-D-004](decisions/OFS-NFS-D-004-all-in-moderate.md) | All-in moderate fleet follow-through | Accepted |
| [OFS-NFS-D-005](decisions/OFS-NFS-D-005-drydock-migration-cycle.md) | Drydock follows the OFS → NFS migration cycle | Accepted direction |

## Working documents

- [Migration glossary](glossary.md)
- [Target NFS architecture](architecture/target-nfs.md)
- [Shell parity matrix](architecture/shell-parity-matrix.md)
- [Modes and gates](gates/modes-and-gates.md)
- [Evidence contract](gates/evidence-contract.md)
- [Fleet inventory](inventory/fleet-inventory.md)
- [Current OFS baseline](architecture/baseline-ofs.md)
- [Open questions](open-questions.md)
- [2026-07-29 control-cohort evidence snapshot](evidence/2026-07-29-control-cohort.md)

## Deliberately not decisions yet

The following remain research or planning material until runtime evidence and
product prioritization close them:

- exact VeeCode shell parity required for the NFS arm;
- the final boundary between `app-next` and a future `nfs-port` module;
- the cost and readiness of each fleet plugin;
- configuration-composition behavior across the complete fleet;
- which AI-governance capabilities the product should prioritize.

## Recommended continuation order

1. Review the target and vocabulary.
2. Close the first shell-parity dispositions.
3. Turn the evidence contract into an executable Drydock shape.
4. Run the full fleet inventory in the declared NFS mode.
5. Resolve the remaining questions with evidence and product priorities.

Documentation expansion should stop at this point unless a new evidence class
or decision boundary appears. The next substantial work is runtime validation
and Drydock implementation, not another layer of migration prose.
