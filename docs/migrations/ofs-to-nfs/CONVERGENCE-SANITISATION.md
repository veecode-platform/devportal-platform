# Convergence and sanitisation of the OFS→NFS migration material

> Date: 2026-08-06 · Scope: `devportal-platform` (public) + `veecode-drydock` (canonical docs)
> This document settles **where each thing lives** after the sanitisation, so the next
> session starts from a clean map, without re-collecting and without any risk of pushing
> what must not be pushed.

---

## 0. Open incident — the force push did not close the exposure

**The reverted commit is still public and still readable through the GitHub API, by SHA.**
`git push --force` moves the *branch*; it does not delete the object. GitHub keeps serving
unreachable commits by direct SHA until support runs a gc on the repository.

Verified by primary evidence (the SHA is in the out-of-repo record, deliberately):

- the commit exists: `GET /repos/.../commits/<sha>` answers 200 with the original message;
- the files are readable: `GET /repos/.../contents/<path>?ref=<sha>` returns content for
  `terraform.tfvars` (6021 B) and for the personal vault page (5172 B);
- repository visibility: **public**.

### What was actually exposed — 104 files

| Group | Files | Nature |
|---|---|---|
| `plataforma-interna/` | 20 | real production configuration (terraform, tfvars, values template, ADRs, runbooks) |
| `vault/` | 5 | pages from a personal Obsidian vault |
| RHDH guides / references / plugin docs | 61 | copies of public third-party material — no consequence |
| `veecode-drydock` duplicates + dumps | 17 | internal docs that were meant to stay internal — no consequence |
| `MATERIAL-INDEX.md` | 1 | own work |

### Credential assessment — **no literal secret leaked**

Scan over the *committed blobs* (not the working tree), including the `.md` files, looking
for `AKIA…`, `glpat-…`, `ghp_…`, JWT (`eyJ…`), `BEGIN … PRIVATE KEY` blocks, and literal
values in `values.yaml.tpl` and `terraform.tfvars`:

- `values.yaml.tpl` (24 KB, the largest file): **zero** literal values — everything is
  `${...}` / `secretKeyRef` / `existingSecret`;
- `terraform.tfvars`: **zero** secret values;
- the `.tf` files: only Terraform references and commented placeholders;
- the `.md` files and the vault pages: no credentials.

**What leaked is topology, not credentials:** AWS account ids, a bucket name, an EKS
cluster name, the portal domain, the GitLab host, a group name, a region, the Kubernetes
secret name and the Secrets Manager path, SSO profiles. It does not enable direct access;
it enables targeted enumeration and social engineering.

**Conclusion: rotation is not required by the evidence.** What is required is the purge
request to GitHub support — and that decision is yours (§5.1). Order matters: enumerate
first (done above), purge afterwards; purging first destroys the ability to know what
leaked.

---

## 1. Part A — the cut for PR #160 (48 files)

### Verdict: **keep all 48 as they are. Zero moves, zero discards.**

The breakdown below is a **taxonomy**, not a request to split. Reason: the PR is green,
`MERGEABLE`, `CLEAN`, and `nfs-tracer-bench` is the evidence infrastructure that
**produced the 16/16 proof the PR itself claims**. Taking it out leaves the PR's claims
irreproducible and burns the CI state already earned — a real cost for a cosmetic gain.
Extraction, if you want it, is a follow-up PR after the merge.

| Group | Files | Class | Verdict |
|---|---|---|---|
| `Dockerfile.nfs`, `docker/entrypoint.nfs.sh`, `docker/install-dynamic-plugins.py`, `docker/regenerate-extensions-install.js`, `docker/test_install_dynamic_plugins.py` | 5 | **core** | keep — this is the image and the dynamic-plugin install path |
| `app-config.nfs.yaml` | 1 | **core** | keep — `app.packages.include` allowlist + `app.routes.bindings`; two of the six divergences live here |
| `packages/app-next/**` (App, signIn, apis, ToggleThemeButton, AuthApiRefs, veecodeGlobalHeader, `translations/`×7, `config.d.ts`, `package.json`) | 15 | **core** | keep — this is the subject of the PR |
| `packages/app-next/src/*.test.tsx` (×9) | 9 | **core** | keep — 31 tests; the harness is the gate before runtime |
| `packages/backend/src/{index.ts,modules/index.ts,modules/nfsModuleFilter.ts}` | 3 | **core** | keep — the `else` missing from the Module Federation switch (RHIDP-15377) |
| `yarn.lock` | 1 | **core** | keep — it carries the paired set (`frontend-defaults` 0.5.4 … `plugin-catalog` 2.0.7) |
| `scripts/build-local-nfs-image.sh` | 1 | tooling | keep — it is the local build path, not exploration |
| `scripts/nfs-tracer-bench/**` (bench.sh, docker-compose, README, `config/`, `fixtures/`×3, `lib/`, `.gitignore`) | 9 | **tooling** | keep now; candidate for post-merge extraction — already a self-contained directory with its own README and `.gitignore` |
| `scripts/smoke-nfs-{shell,header,scaffolder-run}.mjs` | 3 | **tooling** | keep now; same note — these are the assertions that produced the 16/16 |
| `docs/migrations/ofs-to-nfs/inventory/fase-a-admissoes.md` | 1 | doc | keep — it is the Phase A admission register (Objective 2) riding in a core PR; 58 lines, docs-only, zero risk |

Total: 34 core + 13 tooling + 1 doc = 48.

### Sensitive-data scan over the PR's fixtures and configs — **clean**

Searched across `scripts/nfs-tracer-bench/**`, `scripts/smoke-nfs-*.mjs` and
`app-config.nfs.yaml` for tokens, passwords, API keys, `AKIA`, ARNs, 12-digit account
ids, and client hostnames.

What exists, and why it is acceptable:

- `POSTGRES_PASSWORD: ${BENCH_PG_PASSWORD:-devportal}` — a local bench default with env
  override; the compose file never leaves the machine;
- `admin@bench.local`, `owner: admins`, `allowedHosts: [github.com]` — inert
  placeholders, no chance of colliding with a real value;
- `oci://quay.io/veecode/...` — public artefacts.

**One methodological caveat, not a security one:** `bench.sh` references the Kubernetes
remote by a **moving tag** (`...backstage:bs_1.53.0!backstage-plugin-kubernetes`), not by
digest. The `dynamicRemote` assertion in the 16/16 is therefore reproducible-by-tag, not
pinned. It does not invalidate what was observed; it invalidates repeatability once
`bs_1.53.0` is republished. Fixing it costs one line and can land in the follow-up.

---

## 2. Part B — classifying `material/` (103 files)

> The 103 are the contents of `material/`. The 104th file in the exposed commit was
> `MATERIAL-INDEX.md`, which stays (rewritten) — hence the difference from §0's count.

Underlying finding: **nothing inside `material/` is durable own research.** It is 100%
collection. What is durable and ours is already committed under
`docs/migrations/ofs-to-nfs/` (`architecture/`, `decisions/`, `evidence/`, `gates/`,
`inventory/`, `research/`) or lives in `veecode-drydock`. That simplifies the decision:
`material/` leaves the repository whole.

### Bucket 1 — durable own research: **0 files inside `material/`**

Three untracked files **outside** `material/` are ours and stay:

| File | Destination |
|---|---|
| `MATERIAL-INDEX.md` | **rewritten** as a pointer map (no local copies, no production identifiers) and committed here |
| `research/2026-07-30-marketplace-nfs-contract.md` | committed as-is — 292 lines of own investigation, pinned to commits |
| `HANDOFF-FABLE-5.md` | **moved** to `veecode-drydock`, where `HANDOFF-FASE-1-2026-08-04.md` already lives; the internal duplicate goes to the archive |

### Bucket 2 — third-party copies (must not be pushed; reference the source): **61 files**

| Group | Files | Living source to reference |
|---|---|---|
| `guides/rhdh-doc-*.md` | 10 | `redhat-developer/rhdh` → `docs/dynamic-plugins/*` |
| `references/rhdh-*.md` | 16 | `redhat-developer/rhdh-skill` → `skills/nfs-migration` |
| `SKILL-nfs-migration.md`, `workflow-test-nfs-plugin.md` | 2 | same |
| `explore/upstream-plugin-docs/` | 13 | `redhat-developer/rhdh-plugins` → `workspaces/{global-header,homepage}` |
| `explore/upstream-plugins/` | 10 | same (global-header 2.0.0 source) |
| `explore/upstream-shell/` | 10 | `redhat-developer/rhdh` → `packages/app-next`, `packages/backend` |

Destination: `~/nfs-material/upstream/` — **outside any repository**. They stay on disk
because they are the daily comparison base, and the "compare against the file, don't
infer" rule still holds. They simply stop being one `git add -A` away from a second
incident.

Internal duplication detected: `global-header-CHANGELOG.md` and
`global-header-nfs-guide.md` appear byte-identical in both `upstream-plugins/` **and**
`upstream-plugin-docs/`.

### Bucket 3 — discardable: **42 files**

| Group | Files | Proof / reason | Destination |
|---|---|---|---|
| `explore/dag-decisions/` | 12 | 11 are **byte-identical** to `veecode-drydock` (md5 checked one by one); the 12th is the `HANDOFF-FABLE-5.md` duplicate that already lives at the root | `~/nfs-material/_archive-duplicates/` |
| `explore/*.md` (`docs-migration`, `plataforma-interna`, `repos-nfs`, `upstream-guides`, `vault`) | 5 | `ls`/`find`/`git status` dumps — regenerable in seconds, and the `vault` one is literally a listing of the personal vault | `~/nfs-material/_archive-duplicates/` |
| `explore/plataforma-interna/` | 20 | **a client's real production config.** Hard rule: never in a public repository | `~/nfs-material/_quarantine-sensitive/` |
| `explore/vault/` | 5 | personal Obsidian vault; the living source is `/mnt/b/claude-obsidian` | `~/nfs-material/_quarantine-sensitive/` |

**Nothing was deleted.** The quarantine rule was honoured literally: zero `rm`.

Why the quarantine sits **outside** the repository rather than in `material/_archive/`: an
in-tree `_archive/` keeps production config and a personal vault inside a public repo's
working tree. That is the same state that produced the incident, under a more reassuring
name.

### Prevention

`.gitignore` gains `docs/migrations/ofs-to-nfs/material/`. Belt and braces: the directory
no longer exists here, and if a future agent recreates the collection at the same path, it
is born ignored instead of born untracked-and-forgotten.

---

## 3. Part C — proposed final state

### `veecode-drydock` (private) — living source of the migration's canonical docs

It stays the owner, with no copy anywhere else:
`DAG-EXECUCAO-V3`, `DECISOES-GRILLING`, `LEVANTAMENTO-FASE-A`, `CONVERGENCIA-V4`,
`SEAM-LINHA-1.53`, `MANIFESTO-PACK-V1`, `MATRIZ-SHELL-V1`, `TAREFAS-E-FATOS-V1`,
`CHECKPOINT-*`, `SMOKE-AB-EXPORTER`, `HANDOFF-FASE-1` — **and now `HANDOFF-FABLE-5`.**

> **Found during execution: eight of those docs were untracked in drydock itself** —
> `LEVANTAMENTO-FASE-A` (27 KB), `CHECKPOINT-T1.5-G1A` (the gate evidence),
> `HANDOFF-FASE-1` and five checkpoints. Three of them had their **only other copy**
> inside the `material/` this sanitisation is removing from the public repo. In other
> words: the "living source" had nothing committed, and the copy was one step from
> ceasing to exist.
>
> Committed locally in drydock (private, credential scan clean) before I archived the
> duplicates. Without that, the convergence plan would be false at the point that matters
> most.

### `devportal-platform` — what the code needs in order to explain itself

```
docs/migrations/ofs-to-nfs/
├── CONVERGENCE-SANITISATION.md   ← this document
├── MATERIAL-INDEX.md             ← pointer map (rewritten)
├── README.md · glossary.md · open-questions.md
├── architecture/ · decisions/ (D-001..D-007) · evidence/ · gates/ · inventory/ · research/
└── (material/ no longer exists here — see §2)
```

### `~/nfs-material/` — local collection, outside any repository

```
upstream/                61 files · comparison base (bucket 2)
_quarantine-sensitive/   25 files · plataforma-interna + vault — never commit
_archive-duplicates/     17 files · drydock duplicates + dumps
```

### Golden rule for the next session

1. Enter through `MATERIAL-INDEX.md`. It points; it does not copy.
2. Canonical migration doc → `veecode-drydock`. Never duplicate it here.
3. Parity question → the `plataforma-interna` repo (living source) or the copy in
   `~/nfs-material/_quarantine-sensitive/`. **Reading is allowed; committing is not.**
4. RHDH guide → `~/nfs-material/upstream/`, with the collection version noted. Re-validate
   against the upstream repo before treating it as truth.
5. New collection (`ls`, `find`, dumps) → the session scratchpad, never under `docs/`.

---

## 4. What was executed

All local. **No remote operation, no touch to PR #160.**

- branch `docs/nfs-convergencia-sanitizacao` off `nfs/next` (ADR D-007 forbids direct
  merges; this becomes a PR once you approve);
- `material/` moved whole into `~/nfs-material/`, into the three destinations in §2 — 103
  files reconciled in the output (61 + 25 + 17), zero `rm`;
- `.gitignore` + rewritten `MATERIAL-INDEX.md` +
  `research/2026-07-30-marketplace-nfs-contract.md` + this document, committed on the
  branch;
- `HANDOFF-FABLE-5.md` moved into `veecode-drydock` and committed there (`bf30d34`);
- drydock's eight untracked canonical docs, committed there (`5332cfc`) — see §3.

Nothing was pushed. Both repositories carry the changes in the local working tree only.

---

## 5. Decisions that need you

### 5.1 Purging the exposed commit — the only one with a clock

The reverted commit is public **now**. Rotation is not required (no literal credential),
but a client's production topology is readable by anyone holding the SHA.

What leaked does not require rotation, but it assembles a targeted-phishing kit against a
named client: the GitLab host, the group name, the cluster name, the portal domain, two
AWS accounts and the Secrets Manager path. The real decision is **when** to file the
ticket, not **whether**.

- **(a) Open a GitHub support ticket** asking for a gc of the repository's unreachable
  objects, citing the SHA. It is the only path that actually removes it. **Recommended.**
- **(b) Defer** and accept the exposure meanwhile. Defensible only because no credential
  leaked; this is not "sunk cost", it is continuing exposure.

If (a): the SHA is deliberately absent from this document — a public doc that points the
reader at the exposed commit is worse than useless. It is in the session record and in the
vault.

### 5.2 Extracting the bench from PR #160

- **(a) After the merge**, in a follow-up PR. **Recommended** — it preserves green CI and
  the evidence chain.
- **(b) Now**, redoing the PR. Costs the green CI and the reproducibility of the PR's
  claims.
- **(c) Never** — the bench lives in `scripts/nfs-tracer-bench/` and is already
  self-contained.

### 5.3 A PR for this sanitisation

This branch is committed and **has not** been pushed. Tell me when to open the PR against
`nfs/next`, or whether you would rather it land alongside #160.
