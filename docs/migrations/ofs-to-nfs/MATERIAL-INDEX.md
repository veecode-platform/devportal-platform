# Material index — OFS→NFS migration

> Last updated: 2026-08-06 · Owner: OFS→NFS migration (shell/core track)
> **Single entry point.** Start here before any task.
>
> This index **points**; it does not copy. The 2026-08-06 sanitisation removed the local
> collection from this repository — the why, and where each part went, is in
> [`CONVERGENCE-SANITISATION.md`](./CONVERGENCE-SANITISATION.md). Read its §5 before
> committing any collected material.

## 1. Canonical migration documents — they live in `veecode-drydock`

Location: `veecode-drydock` → `docs/migrations/ofs-to-nfs/`. **Do not duplicate them here.**

| File | What it is for |
|---|---|
| `DAG-EXECUCAO-V3.md` | The ratified execution plan (tasks, gates, dependencies, critical path). Normative source. |
| `DECISOES-GRILLING-2026-08-04.md` | The eleven decisions D-G1..D-G11 (tuple, alpha, fail-closed, floor-not-ceiling parity). |
| `MANIFESTO-PACK-V1.md` | What the P0 pack is made of (mandatory members, `requiredLevel`, acceptance). |
| `MATRIZ-SHELL-V1.md` | The shell decision matrix (15 rows + product surfaces). |
| `TAREFAS-E-FATOS-V1.md` | Executable tasks + facts not yet proven. |
| `CONVERGENCIA-V4.md` | Consolidation of the decision convergences, plus glossary. |
| `LEVANTAMENTO-FASE-A-2026-08-04.md` | The Phase A survey (grafana, rbac, tech radar, s3, kubernetes, mcp). |
| `SEAM-LINHA-1.53-2026-08-04.md` | The 1.53 line seam. |
| `CHECKPOINT-*.md` | Gate state and the primary evidence actually executed. |
| `HANDOFF-FASE-1-*.md`, `HANDOFF-FABLE-5.md` | Session continuity handoffs. |

## 2. What lives in **this** repository

Location: `docs/migrations/ofs-to-nfs/` (this directory).

| Path | What it is for |
|---|---|
| `decisions/OFS-NFS-D-001..D-007` | Accepted ADRs (two arms, compatibility boundary, the `nfs/next` channel). |
| `architecture/` | `baseline-ofs.md`, `target-nfs.md`, `shell-parity-matrix.md`. |
| `evidence/` | Evidence frozen by date (2026-07-29 control cohort, drydock alpha resolution). |
| `gates/` | `modes-and-gates.md`, `evidence-contract.md` — what counts as proof. |
| `inventory/` | `fleet-inventory.md`, `fase-a-admissoes.md` (the Phase A admission register). |
| `research/` | Own investigations pinned to commits (e.g. the Marketplace contract at the boundary). |
| `CONVERGENCE-SANITISATION.md` | Where each thing lives and why. Read before collecting. |

## 3. RHDH guides and references — local collection, outside the repository

Location: `~/nfs-material/upstream/` (61 files, collected 2026-08-05).
Living source: `redhat-developer/rhdh` and `redhat-developer/rhdh-skill`.

| What | Local collection | Living source |
|---|---|---|
| Plugin author guide | `guides/rhdh-doc-migrating-plugins-to-new-frontend-system.md` | `rhdh` → `docs/dynamic-plugins/migrating-plugins-to-new-frontend-system.md` |
| Operator guide (config) | `guides/rhdh-doc-migrating-config-to-new-frontend-system.md` | `rhdh` → `docs/dynamic-plugins/migrating-config-to-new-frontend-system.md` |
| Legacy wiring | `guides/rhdh-doc-frontend-plugin-wiring.md` | `rhdh` → `docs/dynamic-plugins/frontend-plugin-wiring.md` |
| Installing, packaging, export, debugging, versions | the rest of `guides/` | `rhdh` → `docs/dynamic-plugins/*` |
| NFS skill (full playbook) | `SKILL-nfs-migration.md` + `references/*` + `workflow-test-nfs-plugin.md` | `rhdh-skill` → `skills/nfs-migration` |
| Reference NFS shell (`app-next` + backend) | `upstream-shell/` | `rhdh` → `packages/app-next`, `packages/backend` |
| Global Header 2.0.0 (guide, changelog, source) | `upstream-plugins/`, `upstream-plugin-docs/global-header-*` | `rhdh-plugins` → `workspaces/global-header` |
| Homepage 1.17.1 (cards, defaults, header) | `upstream-plugin-docs/homepage-*` | `rhdh-plugins` → `workspaces/homepage` |

**Everything in §3 is version-dependent.** Re-validate against the living source before
treating it as truth.

## 4. Parity = the internal platform

Living source: the `plataforma-interna` repo on Vertigo's internal GitLab.
Reference copy: `~/nfs-material/_quarantine-sensitive/plataforma-interna/`.

> **Hard rule: reading is allowed, committing is not.** These are a client's real
> production configs. Never in a public repository, not under an `_archive/`, not
> "temporarily untracked".

What answers what:

- `PLUGINS.md` — the map of plugins enabled today (presets + dynamicPlugins) and how each
  one is wired. **This is where "what parity means" gets settled.**
- `values.yaml.tpl` + `terraform.tfvars` — the configuration actually applied (auth,
  catalog, CSP, proxy, plugins, PG/CNPG).
- `0012-devportal-v2-platform-chart.md` — the v1→v2 migration decision (pinned parity, no
  `recommended`).
- `0016-s3-backed-aws-catalog-producer.md` + `aws-s3-catalog.md` — **S3 is already
  decided: the core provider (`catalog.providers.awsS3`), not Roadie's.** OCI artefact
  `quay.io/veecode/backstage-aws-dynamic-plugins:1.1.0!aws-s3-catalog-module-for-backstage`.
  Admission recorded in [`inventory/fase-a-admissoes.md`](./inventory/fase-a-admissoes.md).
- `01-aws-s3-discovery-dynamic-plugin-spike.md` / `02-aws-tag-rules-provider-rollout.md` —
  how the provider was validated and rolled out.
- `BLUEPRINT.md` / `lambda-README.md` — the per-account Lambda producer. It **produces**
  descriptors; the provider only reads.
- `devportal_k8s_reader.tf` / `cnpg_cluster.tf` / `gitlab_secret.tf` /
  `devportal_aws_catalog_iam.tf` — the real wiring for Kubernetes (preset, token, TLS
  workaround), for PG (CNPG) and for S3 (IRSA).

## 5. Own research vault — personal, never committed

Location: `/mnt/b/claude-obsidian` (living source, outside any repository).
Relevant entries: `wiki/hot.md`, `wiki/meta/nfs-migration-material-index.md`,
`wiki/meta/nfs-production-decisions-2026-08.md`,
`wiki/concepts/aws-catalog-producer-architecture.md`, and the migration's `wiki/gotchas/*`.

## 6. Upstream repos — living links

| Repo | What for |
|---|---|
| `redhat-developer/rhdh` | The NFS shell (`packages/app-next`) + the guides (`docs/dynamic-plugins/*`). |
| `redhat-developer/rhdh-plugins` | Header (`workspaces/global-header`) and homepage (`workspaces/homepage`). |
| `redhat-developer/rhdh-skill` | The migration playbook as a skill (`skills/nfs-migration`). |
| `veecode-platform/backstage-plugins-for-aws` | The S3/AWS OCI bundle. |
| `veecode-platform/devportal-plugin-export-overlays` | `bs_1.53.0` exports and the publish pipeline. |

## 7. Golden rule

1. **Objective 1 first**: the `nfs/next` image with NFS + app-next + the core (sign-in,
   catalog, scaffolder, techdocs, settings, header, theme). Base = the §3 guides + the §6
   `app-next`.
2. **Parity = the internal platform (§4)**, never 100% of the plugins. A parity question
   has its answer in there — read before asking.
3. **Start from the guides before writing code.** If the guide already proves it, do not
   rediscover it.
4. **Evidence**: published artefact by digest, never a moving tag. `:latest` and `:stable`
   stay untouched — they belong to OFS production. Inspecting image contents is not proof
   of runtime. Hierarchy: real runtime > harness > reading the source.
5. **Escalate** only what is genuinely new, irreversible or external, with the exact
   decision being asked for.
6. **New collection goes to the session scratchpad**, never under `docs/`. `material/` is
   in `.gitignore` precisely so that a re-collection is born ignored.
