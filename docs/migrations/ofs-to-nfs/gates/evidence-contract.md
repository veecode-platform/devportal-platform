# Evidence contract for OFS → NFS claims

Status: proposed execution contract; implementation shape belongs to Drydock

This document defines the minimum provenance needed for a claim about one
subject in one migration mode. It is intentionally stricter than a boot smoke:
the purpose is to let a human distinguish source readiness, artifact readiness,
runtime behavior, coverage gaps and failures without guessing.

## Claim identity

Every report must identify:

| Field | Required meaning |
| --- | --- |
| `runId` | Unique Drydock run or evidence bundle identifier |
| `subjectId` | Stable fleet or shell subject identifier |
| `workspace` | Export-overlays workspace or other declared source scope |
| `packageName` | Package actually inspected or loaded |
| `role` | Frontend, backend or module |
| `mode` | `ofs`, `nfs` or `ab` |
| `frontendArm` | Concrete arm used, such as `packages/app` or `app-next` |
| `profile` | Probe/control profile and its version |
| `timestamp` | Run time in an unambiguous format |

## Provenance

The report must bind the claim to the exact inputs:

- source repository and commit (`sourceRef`);
- overlay/export configuration commit when applicable;
- package or OCI artifact reference and resolved digest (`artifactRef`,
  `artifactDigest`);
- base image reference and digest when the run is containerized;
- DevPortal application commit and Drydock commit/version;
- configuration files or generated configuration checksums;
- relevant feature flags, especially the Standard Module Federation setting;
- backend/plugin dependency versions when they affect the observed surface.

Tags such as `latest`, an unqualified package version or a branch name are not
enough provenance by themselves.

## Test context

The evidence bundle must record the context needed to understand what was
actually exercised:

- entity fixture and exact `entityRef`, if the subject is entity-scoped;
- route, URL and navigation action;
- user/profile/authentication posture, without storing secrets;
- config profile and relevant provider data shape;
- browser/runtime profile and environment identifier;
- whether external dependencies were real, stubbed, absent or unreachable;
- expected surface and the probe used to assert it.

An empty catalog, an absent cluster or an unexercised route must be explicit.
They cannot be converted into success by omission.

## Observation

Each claim must contain an attributable observation:

| Field | Required meaning |
| --- | --- |
| `surface` | Specific route, page, entity tab, API, theme, resource or shell behavior |
| `assertion` | What the probe expected to observe |
| `actual` | What was observed, including an explicit empty/absent result |
| `result` | `pass`, `pass-weak`, `fail`, `gap`, `no-report` or `escalated` |
| `attribution` | Why the result belongs to the subject, host, environment or harness |
| `evidenceRefs` | Links/paths to logs, DOM snapshots, screenshots, traces or manifests |
| `error` | Exact error and stack/log reference when applicable |

`pass-weak` is useful for a partial observation, but it is not equivalent to
NFS readiness. A report with no attributable surface assertion is not a runtime
verification report.

## Lifecycle classification

The observation result and the migration lifecycle status are separate fields.
For example, a subject may have `result: gap` and `status: escalated`, or
`result: pass` for one surface while remaining `source-ready` rather than
`runtime-verified` for the package as a whole.

Allowed lifecycle statuses for the current inventory are:

- `unknown`;
- `source-ready`;
- `artifact-ready`;
- `runtime-verified`;
- `broken`;
- `gap`;
- `unsupported`;
- `requires-port`;
- `blocked`;
- `config-scenario`;
- `escalated`;
- `no-report`.

The status must explain what remains unproven. It must not collapse a missing
probe, a plugin defect and an intentional product boundary into one “failed”
bucket.

## Minimal shape

The exact serialized schema is still open, but any implementation should be
able to produce an equivalent record:

```yaml
runId: drydock-run-<id>
subjectId: <fleet-member>
mode: nfs
frontendArm: app-next
sourceRef: <repository>@<commit>
artifactDigest: sha256:<digest>
configRefs:
  - <config>@<checksum>
entityRef: <namespace>/<kind>/<name>
profile: <probe-profile>
surface: <observable-surface>
assertion: <expected-observation>
actual: <observed-result>
result: pass|pass-weak|fail|gap|no-report|escalated
status: source-ready|artifact-ready|runtime-verified|broken|gap|unsupported|escalated|no-report
evidenceRefs:
  - <immutable-evidence-reference>
```

## Human checkpoint

Automated evidence may generate, classify and propose a next action. It may
not silently merge repairs, promote an image or change the production default.
The evidence bundle must make the human checkpoint visible, including the
decision, actor and time when a gate or lifecycle transition is accepted.

## Related documents

- [Modes and gates](modes-and-gates.md)
- [Fleet inventory](../inventory/fleet-inventory.md)
- [Drydock migration decision](../decisions/OFS-NFS-D-005-drydock-migration-cycle.md)
