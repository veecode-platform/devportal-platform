# Design: AI-first concept-first docs IA for devportal-platform

**Date:** 2026-05-18
**Status:** Proposed
**Author:** Brainstormed with Claude Code, decisions by @Elesiann
**Workstream:** Docs (first of two; CI workstream gets its own spec later)

## Context

`devportal-platform` collapsed the old `devportal-base` + `devportal-distro`
two-image topology into a single unified image with a runtime preset
catalog. The architectural work shipped (ADR-010, ADR-011, ADR-012,
PRs through #23). The unblocked next step is the **docs surface** that
makes the product approachable, because three pains remain after the
unified image:

1. **V0 customer overhead.** A potential customer evaluating the
   product currently has to learn project-specific concepts (image
   layout, the preset model, dynamic-plugin loading, app-config
   layering) *before* learning baseline Backstage concepts
   (templates, plugins, the catalog). The docs that exist are
   accurate-ish but dense and scattered.
2. **Plugin-author opacity.** There is no clear path documented for
   "I have a Backstage plugin idea; how do I get it loaded into
   devportal-platform?" — the answer crosses two repos
   (`devportal-platform` and `devportal-plugin-export-overlays`) and
   no single document walks the path.
3. **AI-assistant friction.** The current docs (large files, no
   frontmatter, no machine-readable index) don't load cleanly into
   LLM context windows; an AI agent helping with the project has to
   grep through 600-line files instead of pulling the relevant
   200-line concept file.

This spec covers the docs reorganization that addresses all three.
A separate spec will cover the parallel CI improvement workstream.

## Decision

Reorganize `docs/` in place around an **AI-first, concept-first
information architecture**:

- Atomic markdown topic files (one concept per file, ~400 lines cap)
- YAML frontmatter declaring purpose / audience / type / related
- A hand-curated `docs/README.md` entry point with task-based
  wayfinding
- An auto-generated `/llms.txt` at repo root following the
  [llmstxt.org](https://llmstxt.org) convention for LLM
  consumption
- Plain markdown source-of-truth (no MDX, no framework-specific
  extensions) so any future static-site generator (Docusaurus,
  Astro Starlight, Backstage TechDocs) can render the same files
  without rewriting

Scope of this spec: **operator + plugin-author content, all in the
`devportal-platform` repo.** Cross-links out to
`devportal-plugin-export-overlays` for content that legitimately
lives there (the actual plugin build + OCI publish flow); we do not
author content in that other repo as part of this work.

Migration approach: **reorganize in place** — split large files into
atomic topics, add frontmatter, fill gaps, retire the old files once
their content has fully migrated. Ships in two phases (see § Phasing).

## Information architecture

### Directory shape

```
docs/
├── README.md                              ← entry: TL;DR + "start by task"
├── topics/                                ← atomic concept files
├── how-to/                                ← short task recipes (~50–150 lines)
├── reference/                             ← schemas, lookup tables, glossary
├── adr/                                   ← unchanged; existing ADRs stay
├── ROADMAP_FEATURES.md                    ← stays at top level (status, not docs)
├── ROADMAP_BACKLOG.md                     ← stays at top level
├── UPGRADING_FROM_BASE_DISTRO.md          ← stays at top level (one-time migration)
└── MUI_MIGRATION_STATUS.md                ← stays at top level (point-in-time status)
```

### Topic file inventory (`docs/topics/`)

~24 files at full coverage, partitioned across the two phases:

- `installing.md`
- `presets.md`
- `dynamic-plugins.md`
- `configuration-layering.md`
- `catalog.md`
- `scaffolder.md`
- `rbac.md`
- `auth.md`
- `theming.md`
- `techdocs.md`
- `plugin-authoring.md`
- `plugin-packaging.md`
- `plugin-lifecycle.md`
- `preset-authoring.md`
- `deployment.md`
- `observability.md`
- `security.md`
- `upgrading.md`
- `local-development.md`
- `image-build.md`
- `release.md`
- `i18n.md`
- `repo-layout.md`
- `backstage-internals.md`

### How-to recipes (`docs/how-to/`)

~10 recipes at full coverage, written incrementally as questions
surface in practice. Initial seed list:

- `add-github-oauth.md`
- `customize-theme.md`
- `extend-rbac-policy.md`
- `create-a-dynamic-plugin.md`
- `publish-a-plugin-bundle.md`
- `compose-presets.md`
- `add-a-custom-preset.md`
- `mount-app-config-overlay.md`
- `deploy-to-kubernetes.md`
- `scan-image-with-trivy.md`

### Reference (`docs/reference/`)

~7 files, lookup-style:

- `env-vars.md` — every env var the image consumes at boot, source
  cited
- `preset-schema.md` — the full preset YAML format (frontmatter,
  variables, plugins, appConfig)
- `dynamic-plugin-schema.md` — the entries in
  `dynamic-plugins.default.yaml`
- `app-config-precedence.md` — the `--config` load order
- `core-plugins.md` — the always-on Core-tier plugins
- `shipped-presets.md` — the current 12 presets in a table
- `glossary.md` — Backstage terms with one-line definitions and
  upstream links

### Migration map (today → new home)

| Current | New location |
|---|---|
| `PROJECT_CONTEXT.md` | absorbed into new `docs/README.md` |
| `MONOREPO_STRUCTURE.md` | `topics/repo-layout.md` |
| `DEVELOPMENT_GUIDE.md` | split: `topics/local-development.md` + several `how-to/` recipes |
| `DOCKER_DEVELOPMENT.md` | `topics/image-build.md` |
| `BACKSTAGE_ARCHITECTURE.md` | `topics/backstage-internals.md` |
| `DYNAMIC_PLUGINS_ARCHITECTURE.md` | split between `topics/dynamic-plugins.md` and `topics/plugin-authoring.md` |
| `PLUGINS.md` | split: `reference/core-plugins.md` + folded into `topics/dynamic-plugins.md` |
| `CONFIGURATION_GUIDE.md` | split: `topics/configuration-layering.md` + `reference/app-config-precedence.md` |
| `RBAC.md` | `topics/rbac.md` |
| `UPGRADING.md` | `topics/upgrading.md` |
| `RELEASE_CYCLE.md` | `topics/release.md` |
| `SECURITY_SCAN_AND_FIX.md` | `topics/security.md` + `how-to/scan-image-with-trivy.md` |
| `DYNAMIC_PLUGIN_TRANSLATIONS.md` | `topics/i18n.md` |
| `MUI_MIGRATION_STATUS.md` | stays as-is (point-in-time status) |
| `ROADMAP_FEATURES.md`, `ROADMAP_BACKLOG.md` | stay as-is |
| `UPGRADING_FROM_BASE_DISTRO.md` | stays as-is (one-time customer migration) |
| `adr/*` | unchanged |

Total new file count after migration: ~40–45 markdown files across
`topics/` + `how-to/` + `reference/`, plus the unchanged ADRs and
the top-level files that stay.

## Frontmatter schema

Every file under `topics/`, `how-to/`, `reference/` carries a YAML
frontmatter block:

```yaml
---
name: presets                                # required, kebab-case, matches filename
description: Composable YAML contracts that turn the generic image into a working IDP.   # required, one line
type: topic                                  # required: topic | how-to | reference
audience: [operator, plugin-author]          # required: array of {operator, plugin-author, contributor}
related: [dynamic-plugins, configuration-layering, preset-authoring]   # recommended, 3–6 slugs
status: stable                               # optional, defaults to stable; values: stable | draft | deprecated
updated: 2026-05-18                          # optional, last meaningful content update
---
```

`adr/` files keep their existing convention (no frontmatter — the
ADR's `## Status` line is the equivalent).

## Cross-link convention

Two parallel link paths, by design:

1. **Body markdown links** use relative paths
   (`[presets](../topics/presets.md)`). These render on GitHub today,
   render in any future static-site generator without preprocessing,
   and survive bookmark navigation.
2. **Frontmatter `related:` array** is a machine-readable graph of
   adjacent slugs (3–6 per file). LLMs use it for context pulls; a
   future static-site generator uses it for "related topics"
   sidebars. No manual sync between the two — `related:` is
   curation, the body has whatever inline links the text needs.

A linter in CI checks: every `related:` slug resolves to a real
file; every body link to `../{topics,how-to,reference,adr}/*.md`
points at a real file; orphan files (referenced by nothing) emit
warnings, not errors.

## Naming

- All slugs are kebab-case (`plugin-authoring.md`, not
  `pluginAuthoring.md` or `plugin_authoring.md`).
- Filenames match the `name:` field exactly.
- Renames go through a single PR that also updates every `related:`
  field and body link in the same commit (the linter catches misses).

## Wayfinding

### `docs/README.md` — the front door

Replaces today's `PROJECT_CONTEXT.md` as the entry point. Modelled
after the `veecode` skill's `SKILL.md` shape, tailored for a
public-facing audience:

```
# devportal-platform — docs

> One-line positioning.

## What this is
2–3 sentences. Pointer to ADR-010 for the why.

## Two paths of use
Brief: preset path vs raw Backstage path. Pointer to topics/configuration-layering.md.

## Where to start by task
- Running it for the first time → installing → presets → configuration-layering
- Modifying which plugins are active → dynamic-plugins → presets
- Wiring an integration → presets → auth → catalog
- Creating a new dynamic plugin → plugin-authoring → plugin-packaging → preset-authoring
- Customizing the theme → theming
- Deploying to Kubernetes → deployment
- Upgrading → upgrading
- Migrating from devportal-base + devportal-distro → UPGRADING_FROM_BASE_DISTRO.md

## Topic index
(auto-generated table: name + description per topics/*.md)

## How-to recipes
(auto-generated table)

## Reference
(auto-generated table)

## ADRs
(auto-generated list)
```

The "Where to start by task" block is hand-maintained (curation).
The four indexes below it are generated by the same script that
emits `llms.txt` (next), from the same frontmatter source of truth.

### `/llms.txt` at repo root

Following the [llmstxt.org](https://llmstxt.org) convention so any
LLM cloning the repo finds the index at a predictable path.
Auto-generated from frontmatter — never hand-edited.

```
# devportal-platform

> Open-source Backstage distribution shipped as one unified container image. Operators select presets at runtime (VEECODE_PRESETS) to turn the generic image into a working IDP.

## Topics
- [Presets](docs/topics/presets.md): Composable YAML contracts that turn the generic image into a working IDP.
- [Dynamic plugins](docs/topics/dynamic-plugins.md): OCI loading + install-dynamic-plugins.py.
- … (one line per topic, lifted from frontmatter `description`)

## How-to
- … (same pattern)

## Reference
- … (same pattern)

## ADRs
- [ADR-010](docs/adr/010-unified-image-and-presets.md): Unified image, preset catalog, OCI dynamic plugins.
- [ADR-011](docs/adr/011-frontend-design-system.md): Frontend design system.
- [ADR-012](docs/adr/012-anonymous-ubi-mirror.md): Anonymous UBI mirror.
```

### The triad

| File | Purpose | Audience |
|---|---|---|
| `docs/README.md` | Human entry point — wayfinding | Operators, plugin authors, evaluators |
| `/llms.txt` | Machine-readable index of all docs (auto-generated) | LLMs / agents / future static-site generator |
| `/CLAUDE.md` (already exists) | How AI assistants should *behave* when working in this repo | AI coding assistants |

No content overlap. README is wayfinding for humans, llms.txt is
wayfinding for machines, CLAUDE.md is workflow rules for AI.

### Generator script

A small Python script (`scripts/build-docs-index.py`) runs on every
push to main:

1. Walks `docs/topics/`, `docs/how-to/`, `docs/reference/`,
   `docs/adr/`.
2. Parses each file's frontmatter (`name`, `description`, `type`,
   etc.).
3. Writes the index sections of `docs/README.md` between marker
   comments (`<!-- BEGIN topic-index -->` / `<!-- END topic-index -->`).
4. Writes `/llms.txt` end-to-end.
5. CI fails on stale output (the PR check regenerates and diffs;
   uncommitted drift fails the check).

The frontmatter linter is a sibling script
(`scripts/lint-docs-frontmatter.py`) that validates required
fields, slug uniqueness, `related:` resolution, and orphan
warnings.

## Content style guide

- **Hard cap ~400 lines per file.** If a topic outgrows that, it
  splits into two topics.
- **TL;DR in the first 3–5 lines** under a `## What this is`
  heading. The reader (or LLM) should know whether the file is
  relevant in one screen.
- **Per-file structure**: `## What this is` → `## How it works` →
  `## Common operations` (or `## Gotchas`) → `## Related topics`.
  Skip a section if empty rather than padding it.
- **Self-contained**: assume the reader has not read adjacent
  files. One-sentence recap of concepts referenced from elsewhere,
  then a link.
- **Concrete over abstract**: every shipped-state claim cites a
  file path or line range from the actual repo. No "we will" / "in
  a future version" — defer roadmap to `ROADMAP_FEATURES.md`.
- **Code blocks runnable or labelled**. If illustrative, say so.
- **House style follows the adversarial discipline used in the
  ADR-010 + UPGRADING_FROM_BASE_DISTRO.md work (PRs #21–#23)**:
  verify every claim against current code, no inherited POC
  predictions, no overstated coverage.

## Phasing

### Phase 1 — foundation + V0-overhead-killing topics (one PR, ~15–18 files)

| Category | Files |
|---|---|
| Wayfinding | `docs/README.md`, `/llms.txt`, `scripts/build-docs-index.py`, `scripts/lint-docs-frontmatter.py`, PR-check workflow entry |
| Topics (the install → customize golden path) | `topics/installing.md`, `topics/presets.md`, `topics/dynamic-plugins.md`, `topics/configuration-layering.md`, `topics/theming.md`, `topics/plugin-authoring.md`, `topics/plugin-packaging.md` |
| Reference (the lookups people need from day 1) | `reference/env-vars.md`, `reference/preset-schema.md`, `reference/shipped-presets.md`, `reference/glossary.md` |
| Untouched | ADRs, ROADMAP_*, UPGRADING_FROM_BASE_DISTRO.md, MUI_MIGRATION_STATUS.md, and (for now) the existing top-level docs — those stay until Phase 2 reabsorbs them |

**Phase 1 deliverable**: a new operator can go from `docker run` to
a working integration using only `docs/README.md`. A plugin author
can go from a plugin idea to a loaded dynamic plugin in the image
using only `topics/plugin-authoring.md` + `topics/plugin-packaging.md`
(with crosslinks to `devportal-plugin-export-overlays` for the
actual build).

### Phase 2 — complete coverage + retirement of old top-level files

Likely splits into 2–3 sub-PRs grouped by topic cluster (operator
topics; author topics; reference + retirement).

| Category | Files |
|---|---|
| Remaining topics (~17) | `catalog`, `scaffolder`, `rbac`, `auth`, `techdocs`, `plugin-lifecycle`, `preset-authoring`, `deployment`, `observability`, `security`, `upgrading`, `local-development`, `image-build`, `release`, `i18n`, `repo-layout`, `backstage-internals` |
| Remaining how-to recipes (~10) | from the seed list above + whatever real questions surface during Phase 1 |
| Remaining reference (~3) | `dynamic-plugin-schema.md`, `app-config-precedence.md`, `core-plugins.md` |
| Retirement | delete `CONFIGURATION_GUIDE.md`, `DEVELOPMENT_GUIDE.md`, `DOCKER_DEVELOPMENT.md`, `BACKSTAGE_ARCHITECTURE.md`, `DYNAMIC_PLUGINS_ARCHITECTURE.md`, `PLUGINS.md`, `RBAC.md`, `UPGRADING.md`, `RELEASE_CYCLE.md`, `SECURITY_SCAN_AND_FIX.md`, `MONOREPO_STRUCTURE.md`, `PROJECT_CONTEXT.md`, `DYNAMIC_PLUGIN_TRANSLATIONS.md` once content is fully absorbed |

## Success criteria

1. **V0 path**: a fresh operator opens `docs/README.md` and reaches
   a working `VEECODE_PRESETS=recommended,veecode-theme,<integration>`
   instance using only links from the README, in under 30 minutes.
2. **Plugin author path**: a developer with a Backstage plugin idea
   reads `topics/plugin-authoring.md` + `topics/plugin-packaging.md`
   and ends up with an OCI bundle loaded into a running
   `devportal-platform` instance.
3. **LLM-context fit**: `/llms.txt` under 2 KB; each `topics/*.md`
   under ~400 lines; average frontmatter `related:` graph has 3–6
   nodes.
4. **No drift**: every CI run regenerates `README.md` index
   sections and `/llms.txt`; stale output fails the PR check.
   Frontmatter linter passes on 100% of files.
5. **Phase 1 PR is reviewable**: single PR, ~15–18 files, no file
   over 400 lines.

## Out of scope

- **CI workstream.** Mirror + improve publish/release/security
  pipelines. Gets its own brainstorming → spec → plan pass.
- **A hosted documentation site** (Docusaurus / Astro Starlight /
  custom domain). The format chosen here is intentionally
  generator-agnostic so a site can be added later without
  restructuring; the site itself is a separate workstream.
- **TechDocs-in-the-image dogfooding.** Same generator-agnostic
  reasoning. Could be added later by registering a catalog entity
  that points at the same markdown source.
- **Authoring content in `devportal-plugin-export-overlays`'s own
  docs.** Cross-links from this repo out to that one's existing
  README; no content writes in that repo as part of this spec.
- **A migration script for legacy customers** translating
  `VEECODE_PROFILE` → `VEECODE_PRESETS`. Tracked separately in
  `ROADMAP_FEATURES.md`.

## Open questions and follow-ups

- **Linter implementation language**: Python (matches
  `install-dynamic-plugins.py`) vs Node (matches the rest of the
  tooling). Defer to the implementation plan; Python is the
  natural fit because the docs work has no Node dependency.
- **PR-check workflow shape**: add a new `docs-check` job to
  `pr-check.yml` vs separate `docs-check.yml`. Implementation
  detail.
- **Should the entry `docs/README.md` redirect from the repo-root
  README, or coexist?** The repo root `README.md` is a quickstart;
  `docs/README.md` is the docs entry. They serve different
  purposes and should both exist with cross-links between them.
- **How to handle a Backstage version bump** (e.g. eventual 1.50):
  the `updated:` frontmatter field captures freshness, but
  version-pinned facts (`bs_1.49.4` tags, the cbme stopgap) will
  drift. The linter could grow a "claims-against-current-code"
  check later; for now, the discipline is "every claim cites a
  file path so reviewers can verify against current main".
- **i18n for the docs themselves**: out of scope here. The
  product supports en + pt translations for plugin strings; docs
  stay English-only in Phase 1 and 2.

## Related work

- ADR-010 — Unified image + preset catalog (the architectural
  context this docs work serves)
- ADR-011 — Frontend design system (theme as preset; informs
  `topics/theming.md`)
- ADR-012 — Anonymous UBI mirror (informs `topics/image-build.md`
  in Phase 2)
- UPGRADING_FROM_BASE_DISTRO.md — customer migration guide (stays
  outside the new tree)
- PR #21 / #22 / #23 — the discipline that becomes the house style
- `~/.claude/skills/veecode/` — reference implementation of the
  same atomic-topic + frontmatter pattern, at smaller scale

## Next step

This spec → an implementation plan via the
`superpowers:writing-plans` skill. The plan covers Phase 1 only;
Phase 2 gets its own plan once Phase 1 ships and we have real
feedback.
