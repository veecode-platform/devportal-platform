# Open questions

Status: non-normative register; no item below is an accepted decision

This is the boundary between what has already been decided and what still
needs evidence, product prioritization or an explicit human choice. An open
question may block a gate without implying that the migration direction is
wrong.

## Target and product

| Question | Why it matters | Closure signal |
| --- | --- | --- |
| Which shell behaviors are mandatory for the first NFS production candidate? | Without a parity floor, “the NFS shell works” can mean either a useful migration or an unusable demo. | Approved must-have list mapped to the shell parity matrix. |
| Which AI-governance capabilities are product priorities? | Governance is a product direction, not automatically a consequence of changing frontend architecture. | Prioritized use cases with an explicit first release boundary. |
| Which known parity gaps are acceptable after the first cutover, if any? | A bounded gap can be managed; an unnamed gap becomes accidental regression. | Owner, impact, rollback/follow-up and human acceptance for each gap. |

## NFS architecture

| Question | Why it matters | Evidence or decision needed |
| --- | --- | --- |
| Is `app-next` the final NFS package, or should the NFS arm become a separate `nfs-port` module? | It affects package ownership, image wiring, local development and Drydock integration. | One documented packaging boundary validated against the current repository layout. |
| Which current VeeCode shell behavior belongs in NFS extensions versus application configuration? | It prevents recreating OFS host wiring under a different name. | Shell parity rows linked to concrete NFS extension/config ownership. |
| What is the supported composition model for shared configuration such as `github` and `github-auth`? | The fleet needs one coherent integration contract without making plugins inseparable or duplicating secrets. | A tested config scenario naming the source of shared data, plugin contracts and override rules. |
| Which capabilities remain application-owned because they are cross-plugin concerns? | Some providers, auth and global services should not be accidentally implemented once per plugin. | Host capability list and plugin dependency rules. |
| What is the minimum Standard Module Federation/package discovery contract for the production image? | A local NFS shell can pass while the published image omits the needed package or manifest. | Containerized Gate 0/1 evidence using immutable artifacts. |

## Fleet and migration cost

| Question | Why it matters | Closure signal |
| --- | --- | --- |
| What is the frozen fleet scope for the first census? | Cost and completeness are meaningless without a fixed denominator. | Export-overlays snapshot with source and artifact references. |
| Which five control cases represent the main failure classes? | The cohort should expose harness and architecture gaps before broad repair work. | Cohort approved and each case has a truthful report or explicit blocker. |
| How many plugins are source-ready, artifact-ready, runtime-verified, broken or unsupported? | This is the first defensible estimate of migration size. | Full NFS census under the declared mode and evidence contract. |
| Which failures are plugin ports, which are host gaps and which are harness gaps? | Repair ownership and sequencing differ materially by class. | Failure taxonomy backed by attributable runtime evidence. |
| How are NFS-only or non-frontend subjects represented in Drydock? | The all-in policy includes subjects that do not fit a simple frontend render probe. | Explicit lifecycle/reporting path for backend, NFS-only and non-observable subjects. |

## Drydock and release

| Question | Why it matters | Closure signal |
| --- | --- | --- |
| What is the smallest executable NFS claim Drydock must support? | It determines the first implementation slice and avoids building a generic migration platform prematurely. | Gate 2/3 slice producing the evidence contract end to end. |
| Which repairs can Drydock propose or apply, and where is human escalation mandatory? | All-in lifecycle coverage does not mean autonomous repair of every class. | Repair policy by failure class, with merge/promotion kept human-controlled. |
| Where are immutable evidence bundles stored and how are they linked to reports? | A report without durable evidence cannot support a migration or rollback decision. | Evidence path/retention contract exercised by a real run. |
| What is the cutover threshold and rollback trigger? | Gate completion alone does not define whether production should change arms. | Human-approved release rule naming parity, fleet, residuals and rollback proof. |

## Questions deliberately closed for now

These are not open questions in the current decision baseline:

- Backstage 1.49.4 → 1.53.0 and OFS → NFS are separate axes.
- The transition has explicit OFS and NFS arms.
- Compatibility helpers are tactical and are not the permanent NFS strategy.
- Every declared fleet member receives an explicit lifecycle outcome.
- Drydock follows the migration cycle and preserves a human merge/promotion
  checkpoint.

See the [decision register](README.md#decision-register) for the normative
documents.
