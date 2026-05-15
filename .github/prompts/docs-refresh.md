# Handoff: author `docs/` for `devportal-platform`

One-shot prompt for a fresh-context agent. Not part of CI — invoke
manually when a human is ready to land the docs.

## TL;DR

`devportal-platform/docs/` currently contains only ADRs (001-012). The
broader documentation set — getting started, monorepo structure,
configuration, Docker workflow, dynamic-plugins architecture, etc. —
**does not exist in this repo yet**. The `CLAUDE.md` was lifted
verbatim from `devportal-base` and references docs that were never
ported. Your job is to author them, using `devportal-base/docs/` as a
reference for shape and topic coverage, and the **current code of
`devportal-platform` as the only source of truth for content**.

This is not a port. Most of the underlying mechanics changed between
the two repos (ADR-010 collapsed base+distro into one unified image,
ADR-011 made the theme a dynamic plugin, ADR-009's profile system was
replaced by `presets/`). Treat `devportal-base/docs/` as a topic map
and a tone reference, not a copy source.

## Hard rules — read before touching anything

1. **Verify every non-Backstage-core claim against the codebase.**
   `devportal-base/docs/` is the reference shape, not a fact source. If
   `devportal-base/docs/DEVELOPMENT_GUIDE.md` says `yarn dev-local` —
   check whether that script exists in `devportal-platform`'s
   `package.json`. Repeat for every command, file path, env var, port,
   default, behavior. **If you cannot find it in code, do not write it.**
2. **Backstage version is 1.49.4.** Pinned in `backstage.json` and
   `package.json` resolutions. ADR-014 (if drafted) defers 1.50; don't
   write 1.50-era content.
3. **Image name is `veecode/devportal-platform`**, *not* `veecode/devportal-base`
   and not `veecode/devportal`. Published to `docker.io/veecode/devportal-platform`
   via `.github/workflows/publish.yml` (manual dispatch only — no auto-publish yet).
4. **Two primary paths of use**: preset (`VEECODE_PRESETS=…`) and raw Backstage.
   Read `presets/README.md` § "Two primary paths of use" — that framing is
   load-bearing across DEVELOPMENT_GUIDE, CONFIGURATION_GUIDE, and
   DOCKER_DEVELOPMENT.
5. **No profile system.** ADR-009's `VEECODE_PROFILE` system from
   `devportal-base` is replaced by presets. Any doc that says
   "set `VEECODE_PROFILE=github`" is wrong — it's `VEECODE_PRESETS=github`
   now and it composes (`VEECODE_PRESETS=recommended,github,…`).
6. **Theme is a dynamic plugin**, not a baked palette. Read ADR-011
   end-to-end before writing anything that mentions theming. The
   gotchas in ADR-011 § "Lições críticas" (rhdh-cli vs janus-cli,
   `sideEffects: ["**/*.css"]`, peer deps for React/MUI, theme id
   collision with static themes) are real and recurring — capture them
   wherever theming or dynamic-plugin authoring shows up.
7. **Dynamic plugin loading** uses Scalprum + Module Federation (ADR-001),
   same mechanics as `devportal-base`. The export tool changed in
   greenfield: `rhdh-cli plugin export` is now preferred over
   `janus-cli package export-dynamic-plugin`. Confirm against each
   wrapper's `dynamic-plugins/wrappers/*/package.json` before claiming
   either is universal.
8. **The `cbme` stopgap exists.** The Dockerfile pulls
   `quay.io/veecode/extensions:bs_1.49.4` via skopeo and sed-patches
   one file (`catalog-backend-module-extensions/dist/module.cjs.js`).
   This is documented at length in `Dockerfile:217-264`. Any doc that
   touches the marketplace catalog tab or the extensions OCI image
   should reference this; do not paper over it.

## Sources of truth (read these first, in order)

| Path | Why it matters |
|---|---|
| `docs/adr/010-…` (not yet drafted; check `git log -- docs/adr/`) | ADR-010 = unified image. Foundational. |
| `docs/adr/011-frontend-design-system.md` | Theme strategy + dynamic-plugin authoring lessons. |
| `docs/adr/012-anonymous-ubi-mirror.md` | Why the image pulls from `registry.access.redhat.com`. Cite when DOCKER_DEVELOPMENT mentions the base image. |
| `Dockerfile` | The actual build. Comments inline explain the cbme stopgap, the multi-stage layout, the WSL memory ceilings. |
| `entrypoint.sh` | Boot-time behavior. Preset resolver, config layering, env var validation. |
| `presets/README.md` | The contract presets satisfy. "Two primary paths of use" section especially. |
| `presets/SCHEMA.md` | Preset format. |
| `scripts/dev-run.sh` | Local dev story (bind-mount overlay, no rebuild for config changes). |
| `packages/{app,backend}/package.json` | Available yarn scripts. Authoritative for "Common Commands". |
| `package.json` (root) | Workspaces, root scripts, Yarn version. |
| `backstage.json` | Pinned Backstage version. |
| `dynamic-plugins/wrappers/*/package.json` | Wrapper conventions (frontend vs backend role, scalprum name, peer deps). |
| `CLAUDE.md` | **Use cautiously** — it's currently stale (lists 8 docs that don't exist). Use for spirit, not facts. After you finish, update its `docs/` section to reflect what now exists. |

`devportal-base/docs/` (`/home/gio/devportal/devportal-base/docs/`)
is a **shape reference** — what topics are covered, what tone, what
the section structure looks like. Do not copy paragraphs verbatim
without re-verifying every claim against this repo's code.

## Per-document disposition

The doc list below mirrors `devportal-base/docs/`. Each row is a
decision, not a template: skip the table line and read the reference
doc when authoring.

| Doc | devportal-base size | Decision | Key adjustments |
|---|---:|---|---|
| `BACKSTAGE_ARCHITECTURE.md` | 610 | **Port** | Mostly Backstage-core content. Update version refs to 1.49.4. Verify any code samples still import from the right packages. |
| `MONOREPO_STRUCTURE.md` | 281 | **Rewrite** | Same workspace shape (yarn 4 + `packages/` + `plugins/` + `dynamic-plugins/`), but mention the `dynamic-plugins/` sub-workspace explicitly (it has its own `yarn.lock`). |
| `DEVELOPMENT_GUIDE.md` | 570 | **Rewrite** | Remove `VEECODE_PROFILE` mentions. Replace with `VEECODE_PRESETS` examples. Document `scripts/dev-run.sh` workflow (the bind-mount inner loop). |
| `DOCKER_DEVELOPMENT.md` | 50 | **Rewrite** | Unified image story (no more base+distro). `docker build .` → one image. `--memory=4g` on WSL. Anonymous Red Hat mirror per ADR-012. |
| `DYNAMIC_PLUGINS_ARCHITECTURE.md` | 349 | **Rewrite** | Scalprum unchanged. Add: rhdh-cli vs janus-cli decision (ADR-011 lessons), `sideEffects: ["**/*.css"]`, peer-deps requirement, theme-as-dynamic-plugin pattern, OCI references in presets. |
| `DYNAMIC_PLUGIN_TRANSLATIONS.md` | 250 | **Port if used** | Verify any translation system is wired in `packages/app/`. If not, skip. |
| `PLUGINS.md` | 128 | **Port + extend** | Add the wrappers we have (15 dirs under `dynamic-plugins/wrappers/`). Reference `dynamic-plugins.default.yaml` + `presets/recommended.yaml` for what ships enabled. |
| `CONFIGURATION_GUIDE.md` | 597 | **Replace with presets-first guide** | The base version is profile-based and ~600 lines. The greenfield version is much shorter: point at `presets/README.md` + `presets/SCHEMA.md`, explain the operator's two paths, document `app-config.local.yaml` override precedence. |
| `RBAC.md` | 235 | **Port** | Verify against current `rbac-policy.csv` + `rbac-policy-extensions.csv`. Drop any RBAC features not present in greenfield. |
| `SECURITY_SCAN_AND_FIX.md` | 272 | **Port** | Update image name. Reference `.github/prompts/security-scan.md` (the agent that does the scan). |
| `UPGRADING.md` | 244 | **Rewrite** | Backstage bump + UBI bump + `EXTENSIONS_TAG` bump (the cbme OCI tag). All three are independent now. |
| `RELEASE_CYCLE.md` | 50 | **Rewrite** | Publish is manual-dispatch (`workflow_dispatch` in `publish.yml`). No tag-driven publish until the product has a real consumer. Cover semver gate in `validate-version` job. |
| `MUI_MIGRATION_STATUS.md` | 120 | **Delete or stub** | It was a tracking doc for the v4→v5 migration. Greenfield is on v5 from day one. Either delete entirely or replace with a one-paragraph "we're on v5; the v4 compat layer is in `packages/app/`" note. |
| `PROJECT_CONTEXT.md` | 309 | **Rewrite** | High-level "what is this and how is it different from base/distro". Cite ADR-010, ADR-011. |
| `ROADMAP_FEATURES.md` | 36 | **Author fresh** | Don't port — base's roadmap is base's problem. Start from the greenfield's own backlog (Notion has the running list). |
| `ROADMAP_BACKLOG.md` | 74 | **Author fresh** | Same as above. Capture the deferred items: 1.50 migration, MCP plugins reactivation, profile-to-preset customer migration, etc. |

After all docs land, update **`CLAUDE.md`**'s `## Understanding the
codebase` section to match what now exists in `docs/`. Drop entries
for docs you decided to skip; the inherited list is wrong today.

## Out of scope

- **Don't redesign anything.** This is documenting what is, not what
  could be.
- **Don't fix code based on doc inconsistencies.** If `dev-run.sh`
  contradicts what you'd write — open an issue or flag in chat.
  Document what's true.
- **Don't migrate `devportal-base/docs/`'s ADRs.** They're already
  referenced in `CLAUDE.md` as legacy and they live in their own repo.
- **Don't add MCP / Letta / Knowledge / non-existent integrations.**
  Greenfield ships without them; that's the deliberate decision in the
  plan (`/home/gio/.claude/plans/abundant-knitting-cloud.md`).
- **Don't restructure `docs/adr/`.** ADRs are immutable history.

## Deliverable format

- **Branching**: one feature branch off `main`, e.g.
  `docs/initial-set`. If you split into multiple PRs (e.g., by topic
  group: "dev workflow", "plugin architecture", "operations"), use
  child branches off it.
- **Per doc**: a markdown file in `docs/`, scannable, code-anchored
  (link to file paths and ADRs liberally). Use the same naming as
  `devportal-base/docs/` (uppercase snake-case `.md`) so cross-repo
  readers can find their bearings.
- **PR description**: list which docs land, which were skipped (and
  why), which referenced `devportal-base` content is *not* preserved
  (so reviewers can compare).
- **CLAUDE.md update**: included in the final PR or its own commit at
  the end of the branch.
- **Don't merge with PR Check red.** Run `yarn test` locally before
  pushing. Markdown changes shouldn't break tests, but verify.

## Verification checklist before opening the PR

- [ ] No mention of `veecode/devportal-base` or `veecode/devportal-distro` in any new doc (those are sibling repos, not this one).
- [ ] No mention of `VEECODE_PROFILE` anywhere — preset system replaced it.
- [ ] Backstage version 1.49.4 wherever a version appears.
- [ ] Every yarn command cited has an actual entry in `package.json` `scripts`.
- [ ] Every file path cited exists (test with `ls`).
- [ ] Every env var cited is read somewhere in `entrypoint.sh`, `scripts/dev-run.sh`, or `packages/backend/src/`.
- [ ] ADRs cited by number resolve to a file in `docs/adr/`.
- [ ] `CLAUDE.md`'s docs list matches what exists in `docs/` post-PR.

## Where to ask if stuck

The plan that bootstrapped this repo is
`/home/gio/.claude/plans/abundant-knitting-cloud.md` — it has the
6-step history and key decisions. If a doc topic doesn't appear in
the plan, the answer probably isn't on paper anywhere yet; flag it in
chat rather than inventing.
