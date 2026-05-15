# Handoff — Migrate `devportal-platform` to 100% OCI dynamic plugins

One-shot prompt for a fresh-context agent. Read this entire file before
touching anything. The work is sequenced; do not skip phases.

## Context

`devportal-platform` (this repo) ships a single unified Backstage image,
`docker.io/veecode/devportal-platform`. At image build time, a multi-stage
`Dockerfile` builds the frontend, backend, and a workspace of "dynamic
plugin wrappers" (`dynamic-plugins/wrappers/*`), then **bakes the
exported wrapper bundles into `/app/dynamic-plugins-root/`**. At runtime,
`docker/install-dynamic-plugins.py` reads `dynamic-plugins.yaml` and
installs additional plugins — either from local paths (already on disk),
NPM, or OCI (`skopeo`-pulled).

One of the six founding motivations for this repo was to make **OCI the
default channel for dynamic plugins**, decoupling each plugin's lifecycle
from the image's lifecycle. Today, that motivation is at ~30%
completion: 14 plugins in `dynamic-plugins.default.yaml` reference local
paths, only 7 reference OCI URIs. Most of those 14 are baked into the
image at build time.

Reaching 100% OCI is the objective of this work.

## Objective

Migrate **every plugin** currently shipped via local paths
(`./dynamic-plugins/dist/...`) to OCI references (`oci://...`), so that:

1. The image no longer needs to be rebuilt to update a plugin.
2. The Dockerfile's pre-install loop and the `dynamic-plugins/wrappers/`
   workspace can be **deleted entirely** at the end of the migration.
3. `dynamic-plugins.default.yaml` and the preset YAMLs reference OCI
   URIs exclusively (with the one allowed exception of the `cbme`
   stopgap — see "Out of scope" below).

The deliverable is not "some plugins migrated". The deliverable is **the
wrappers workspace disappears**.

## Motivations — read these before doing anything

These are the reasons this work exists. The agent will be asked to make
trade-off calls; these are the principles to apply.

1. **Decouple plugin lifecycle from image lifecycle.** Today, fixing a
   bug in `devportal-marketplace-frontend` requires rebuilding and
   republishing `docker.io/veecode/devportal-platform`. After the
   migration, it's a plugin republish + a runtime config bump. Operators
   can pin to a known-good plugin combo without dragging in unrelated
   image changes.

2. **Image stays small.** Today the image carries ~20 plugins worth of
   built bundles in `/app/dynamic-plugins-root/`. After migration the
   image carries the entrypoint + the static Backstage backend; plugins
   land at boot via skopeo pulls. Smaller image, faster cold start of
   new replicas, less bandwidth for operators.

3. **Match the preset contract literally.** `presets/README.md` § "Two
   primary paths of use" already describes the preset path as
   "resolves OCI plugin references". Right now most presets resolve to
   `./dynamic-plugins/dist/...` paths that exist because the image
   was rebuilt to include them. That's a lie of omission. After
   migration the preset really does what its docs claim.

4. **Lifecycle of `dynamic-plugins/wrappers/` becomes someone else's
   problem.** The wrapper workspace exists because we needed
   compatibility shims for legacy static plugins. With OCI as the
   channel, those shims live next to their plugins (in
   `devportal-plugin-export-overlays` workspaces, or in their own repos)
   and `devportal-platform` stops carrying ~15 Yarn sub-projects' worth
   of build complexity.

## Hard rules — read before touching anything

1. **Verify every claim against code.** This handoff was written at
   commit `c586ae3` of `main`. By the time you read it, the tree may
   have moved. Re-grep, re-list, re-check before acting on any claim
   about file paths, line numbers, or counts.
2. **Backstage version is 1.49.4.** Pinned in `backstage.json`. Do not
   bump as part of this migration; 1.50 is explicitly deferred (see
   `docs/UPGRADING.md`).
3. **Plugin authoring gotchas are real.** When you republish a wrapper
   as an OCI image, you will hit the same export traps documented in
   `docs/adr/011-frontend-design-system.md` § "Lições críticas":
   `rhdh-cli plugin export` (not `janus-cli`), `sideEffects: ["**/*.css"]`,
   React/MUI in `peerDependencies`. Read that ADR end-to-end.
4. **`registry.access.redhat.com` is the UBI source** (ADR-012). Don't
   re-introduce `registry.redhat.io`.
5. **`presets/README.md` § "Discipline" rules still apply.** No business
   logic in presets, no customer-specific config. OCI references go in
   the same slots local references occupied.
6. **Do not bypass `pr-check.yml`.** It is the only CI gate. Run
   `yarn test`, `yarn tsc`, `yarn lint:check` locally before pushing.
7. **No build-check workflow exists.** Image builds happen only on
   manual `publish.yml` dispatch. After non-trivial Dockerfile or
   `dynamic-plugins.default.yaml` changes, run a local
   `docker build .` + boot via `scripts/dev-run.sh run` to validate
   end-to-end.

## Sources of truth — read in this order

1. `docs/PROJECT_CONTEXT.md` — what this repo is, two paths of use, what
   is and isn't shipped.
2. `docs/DYNAMIC_PLUGINS_ARCHITECTURE.md` — how Scalprum + MF + runtime
   plugin loading actually works in this repo.
3. `docs/adr/011-frontend-design-system.md` — wrapper authoring lessons
   (will apply when republishing VeeCode-internal plugins).
4. `presets/README.md` + `presets/SCHEMA.md` — preset contract; OCI
   reference format (line 95 of SCHEMA.md).
5. `docker/install-dynamic-plugins.py` — runtime resolver. Lines 49-80
   document the three `package:` forms (NPM / local path / `oci://`).
   Lines 126-180 are the OCI pull implementation (skopeo).
6. `Dockerfile` — line 197-215 is the pre-install loop that bakes
   plugins into the image. Line 246-264 is the `cbme` stopgap (special
   case, see Out of scope).
7. `dynamic-plugins.default.yaml` — the source of truth for what the
   image installs by default. Today: 14 local refs + 7 OCI refs.
8. `entrypoint.sh` lines 98-158 — preset resolver. Takes
   `VEECODE_PRESETS=a,b,c`, validates required env vars, generates
   `app-config.preset-<name>.yaml` and per-preset plugin fragments.
9. Sibling repo at `/home/gio/devportal/devportal-plugin-export-overlays/`
   — where most plugin OCI images already get published.

## Current state (verified at commit `c586ae3`)

### Plugins baked into the image (Dockerfile pre-install loop, lines 197-215)

These 11 plugin directories are copied from `/app/dynamic-plugins/dist/`
into `/app/dynamic-plugins-root/` at image build time. Every one of them
must end up as an OCI reference:

```
backstage-community-plugin-rbac
backstage-community-plugin-tech-radar-dynamic
backstage-community-plugin-tech-radar-backend-dynamic
veecode-platform-plugin-veecode-global-header-dynamic
veecode-platform-plugin-veecode-homepage-dynamic
veecode-platform-plugin-veecode-theme-dynamic
veecode-platform-backstage-plugin-about-backend-dynamic
veecode-platform-backstage-plugin-about-dynamic
devportal-marketplace-backend-dynamic-dynamic   ← double suffix is intentional, see #6 fix
devportal-pending-changes-dynamic
devportal-marketplace-frontend-dynamic
```

### Local refs still active in `dynamic-plugins.default.yaml`

15 entries (some commented-out, most live):

```
./dynamic-plugins/dist/backstage-plugin-kubernetes-dynamic
./dynamic-plugins/dist/red-hat-developer-hub-backstage-plugin-global-floating-action-button-dynamic
./dynamic-plugins/dist/roadiehq-backstage-plugin-security-insights-dynamic
./dynamic-plugins/dist/roadiehq-backstage-plugin-github-insights-dynamic
./dynamic-plugins/dist/backstage-community-plugin-github-actions-dynamic
./dynamic-plugins/dist/veecode-platform-backstage-plugin-github-workflows-backend-dynamic
./dynamic-plugins/dist/veecode-platform-backstage-plugin-github-workflows-dynamic
./dynamic-plugins/dist/backstage-community-plugin-azure-devops-dynamic
./dynamic-plugins/dist/backstage-community-plugin-azure-devops-backend-dynamic
./dynamic-plugins/dist/backstage-community-plugin-jenkins-backend-dynamic
./dynamic-plugins/dist/backstage-community-plugin-jenkins
./dynamic-plugins/dist/backstage-community-plugin-scaffolder-backend-module-sonarqube-dynamic
./dynamic-plugins/dist/backstage-community-plugin-sonarqube
./dynamic-plugins/dist/backstage-community-plugin-sonarqube-backend-dynamic
```

### OCI refs already in `dynamic-plugins.default.yaml` (precedent — match this style)

```
oci://quay.io/veecode/extensions:bs_${BACKSTAGE_VERSION}!red-hat-developer-hub-backstage-plugin-extensions-backend
oci://quay.io/veecode/backstage:bs_${BACKSTAGE_VERSION}!backstage-plugin-mcp-actions-backend
oci://quay.io/veecode/mcp-integrations:bs_${BACKSTAGE_VERSION}!...
oci://quay.io/veecode/mcp-chat:bs_${BACKSTAGE_VERSION}!...
```

OCI reference format (per `presets/SCHEMA.md:95`):
`oci://<registry>/<image>:<tag>!<plugin-package-name>`

There is also precedent for per-plugin GHCR images in
`presets/README.md:92`:
`oci://ghcr.io/veecode-platform/devportal-plugin-export-overlays/<plugin>:bs_<bs-ver>__<plugin-ver>!<package-name>`

Pick the precedent that matches the plugin's publish origin (see Phase 1
and Phase 2 below).

### Wrappers workspace (to be deleted at end of migration)

15 directories under `dynamic-plugins/wrappers/`. End state: 0
directories, plus `dynamic-plugins/_utils/`, `dynamic-plugins/downloads/`,
`dynamic-plugins/packages/` evaluated for whether they are still needed.

## Decisions already made — don't re-discuss

- **Backstage 1.49.4 stays.** 1.50 deferral (`docs/UPGRADING.md`) is a
  separate epic.
- **`registry.access.redhat.com`** for UBI (ADR-012). Don't switch back.
- **`rhdh-cli plugin export`**, not `janus-cli`, for any plugin
  republish (ADR-011 § Lições críticas).
- **OCI tag scheme is `bs_<backstage>__<plugin>`** when both are pinned,
  e.g. `bs_1.49.4__0.13.0`. See `presets/README.md:92`.
- **`cbme` stopgap (Dockerfile:246-264)** stays. The patch lives in the
  Dockerfile because the bs_1.49.4 build of
  `catalog-backend-module-extensions` imports
  `catalogProcessingExtensionPoint` from `@backstage/plugin-catalog-node/alpha`
  but Backstage 1.50 graduated that export to the main entry. The
  workaround (`sed` patch + `Object.assign`) is bsver-independent and
  must remain until a 1.49.4-correct version is published in the
  `quay.io/veecode/extensions` image. **Do not** try to "OCI-ify" the
  cbme path as part of this migration; that is a separate decision in
  `devportal-plugin-export-overlays`.
- **No build-check workflow** (it was deleted intentionally; org
  convention is build only on release-tag dispatch). Don't re-add as
  part of this work.

## Two-phase migration — sequence matters

Phase 1 unblocks before Phase 2. Each phase is its own PR (or set of
PRs). Do not attempt both in a single PR.

### Phase 1 — plugins that already publish OCI via `export-overlays`

For each local reference in the table below, an OCI image already exists
(produced by `devportal-plugin-export-overlays`'s
`publish-workspace-plugins.yaml` workflow). The migration is a
**reference swap** in `dynamic-plugins.default.yaml` and the preset
YAMLs.

| Local reference | export-overlays workspace | OCI image (GHCR; verify exact path with `gh api` or `skopeo list-tags`) |
|---|---|---|
| `backstage-community-plugin-rbac` | `rbac` | `ghcr.io/veecode-platform/devportal-plugin-export-overlays/backstage-community-plugin-rbac` |
| `backstage-community-plugin-tech-radar(-backend)-dynamic` | `tech-radar` | similar pattern |
| `backstage-plugin-kubernetes(-backend)-dynamic` | (not in overlays — verify; may need Phase 2 treatment) | — |
| `roadiehq-backstage-plugin-security-insights-dynamic` | `roadie-backstage-plugins` | similar |
| `roadiehq-backstage-plugin-github-insights-dynamic` | `roadie-backstage-plugins` | similar |
| `backstage-community-plugin-github-actions-dynamic` | `github-actions` | similar |
| `backstage-community-plugin-azure-devops(-backend)-dynamic` | `azure-devops` | similar |
| `backstage-community-plugin-jenkins(-backend)-dynamic` | `jenkins` | similar |
| `backstage-community-plugin-sonarqube(-backend)-dynamic` | `sonarqube` | similar |
| `backstage-community-plugin-scaffolder-backend-module-sonarqube-dynamic` | `scaffolder-backend-module-sonarqube` | similar |
| `red-hat-developer-hub-backstage-plugin-global-floating-action-button-dynamic` | `global-floating-action-button` | similar |

**For each plugin in this table:**

1. Verify the OCI image exists. Use `gh api` to query GHCR or `skopeo
   list-tags docker://ghcr.io/...`. If it does not exist, escalate as
   open question — don't invent a path.
2. Note the version tags available. Pick the one matching `bs_1.49.4`.
3. Swap the `package:` entry in `dynamic-plugins.default.yaml`. Keep
   `disabled:` and `pluginConfig:` unchanged. Pin to `bs_1.49.4__<exact
   plugin version>` — no floating tags.
4. Search the preset YAMLs (`presets/*.yaml`) for the same plugin name
   and swap there too. The `presets/README.md:92` example shows the
   shape.
5. Remove the corresponding wrapper from `dynamic-plugins/wrappers/`
   only after the preset/default swap is merged and validated. Don't
   delete wrappers in the same PR as the swap (revert path needs to
   exist).
6. Verify locally:
   ```bash
   docker build . -t veecode/devportal-platform:phase1-test
   DEVPORTAL_IMAGE=veecode/devportal-platform:phase1-test \
   VEECODE_PRESETS=recommended ./scripts/dev-run.sh run
   curl -sf http://localhost:7007/healthcheck   # → {"status":"ok"}
   ```
   Plus a quick visual smoke check at `http://localhost:7007/extensions/marketplace`
   to confirm the swapped plugin still loads.

**Veecode-internal scaffolder/catalog modules** (the
`veecode-platform-backstage-plugin-github-workflows*` pair in
`dynamic-plugins.default.yaml`) are a Phase 2 candidate, not a Phase 1
swap — their OCI publish path doesn't exist yet (verified at handoff
time; re-verify).

**`backstage-community-plugin-jenkins`** lacks the `-dynamic` suffix in
the local ref; the `-backend` partner has it. Don't assume symmetry —
some upstream plugins ship the frontend natively-dynamic and only need
the backend wrapped. Verify each.

**Acceptance gate for Phase 1:** all Phase 1 rows above have OCI
references; the corresponding wrapper directories under
`dynamic-plugins/wrappers/` are deleted; image builds; smoke test green.

### Phase 2 — VeeCode-internal plugins (no OCI publish path exists yet)

These plugins live as wrappers in `devportal-platform/dynamic-plugins/wrappers/`
and have **no upstream OCI image**:

```
veecode-platform-plugin-veecode-theme            (referenced by presets/veecode-theme.yaml)
veecode-platform-plugin-veecode-global-header    (Core tier — always-on)
veecode-platform-plugin-veecode-homepage         (Core tier — always-on)
veecode-platform-backstage-plugin-about          (frontend + backend)
devportal-marketplace-backend                    (Recommended tier)
devportal-marketplace-frontend                   (Recommended tier)
devportal-pending-changes                        (Recommended tier)
```

Phase 2 cannot proceed by reference-swap alone. **An OCI publish path
must be created first.** Three options, in increasing order of effort
and decreasing order of mess:

#### Option A — Add workspaces to `devportal-plugin-export-overlays`

Most consistent with current org pattern. For each VeeCode-internal
plugin:

1. Create `workspaces/<plugin>/` in `export-overlays` with the plugin's
   source.
2. Configure `versions.json` to include the plugin.
3. The existing `publish-workspace-plugins.yaml` workflow will publish
   to GHCR + Quay automatically on merge to main.
4. Reference the resulting OCI image from `devportal-platform`.

**Cost**: ~7 plugins × workspace setup time. Centralizes publish but
spreads the codebase across two repos for plugins that are
VeeCode-specific.

#### Option B — Add an OCI publish workflow inside `devportal-platform`

Most self-contained. Add a `publish-internal-plugins.yaml` workflow that:

1. Reuses the existing `dynamic-plugins/` Yarn workspace.
2. Runs `yarn build && yarn export-dynamic` for each VeeCode-internal
   wrapper.
3. Packages each export as an OCI image (one per plugin, `ghcr.io` or
   `quay.io` — match Phase 1 destination for consistency).
4. Tags as `bs_1.49.4__<version-from-package.json>`.
5. Triggers on `workflow_dispatch` initially (match `publish.yml`
   pattern); upgrade to tag-driven later.

After publish, swap references in `dynamic-plugins.default.yaml` and
delete the corresponding wrappers. The `dynamic-plugins/` workspace
shrinks but might not disappear — there may still be need for shared
build tooling.

**Cost**: One new workflow + one OCI build/push pattern to maintain.
Keeps VeeCode-internal plugins in their own repo. Recommended over A
if the agent's bandwidth is limited.

#### Option C — Move each plugin to its own repo

Cleanest but highest cost. Each plugin (`veecode-theme`, `marketplace`,
`pending-changes`) becomes a tiny repo with its own publish workflow.
Recommended only if there is appetite to evolve these plugins
independently.

**Recommendation in the absence of further input: Option B for Phase 2.**
Self-contained, minimal cross-repo coordination, easy to reverse.

**Acceptance gate for Phase 2:** the wrapper directories under
`dynamic-plugins/wrappers/` for all 7 VeeCode-internal plugins are
deleted; the image no longer contains any baked-in plugin (the
Dockerfile pre-install loop at lines 197-215 is empty or removed
entirely); smoke test green.

### Phase 3 — Delete the wrappers workspace

After both phases:

1. `dynamic-plugins/wrappers/` is empty → delete the directory.
2. Audit `dynamic-plugins/_utils/`, `dynamic-plugins/downloads/`,
   `dynamic-plugins/packages/` for whether each is still needed.
3. Audit the Dockerfile builder stage — the `cd dynamic-plugins &&
   yarn build && yarn export-dynamic && yarn copy-dynamic-plugins`
   block is candidate for deletion if no wrappers remain.
4. Update `docs/DYNAMIC_PLUGINS_ARCHITECTURE.md` and
   `docs/PROJECT_CONTEXT.md` to reflect the new reality.
5. Update `CLAUDE.md`'s "Common Commands → Dynamic Plugins" section.

## Out of scope

- **The `cbme` stopgap** stays. It is build-time, uses an OCI source
  image, and the in-tree `sed` patch is bsver-independent. Replacing
  this is a separate decision tied to publishing
  `quay.io/veecode/extensions:bs_1.50.0` from export-overlays, which is
  outside this repo.
- **Bumping to Backstage 1.50.** Deferred.
- **Auto-publish (tag-driven `publish.yml`).** Today
  `publish.yml` is manual-dispatch only. Don't flip it as part of this
  work.
- **Reauthoring presets.** Presets stay as-is in shape; only the
  `package:` references inside them change. Same `requires.variables`,
  same `appConfig`.
- **MCP plugins.** They are already on OCI (see the existing OCI refs
  in `dynamic-plugins.default.yaml`); they are not part of this
  migration.

## Current blockers

None yet — work has not started. The handoff is the starting point.

## Open questions

- **Per-plugin GHCR images vs grouped Quay images?** Phase 1 plugins
  in `export-overlays` are published to **both** `ghcr.io/veecode-platform/...`
  (per-plugin) and `quay.io/veecode/...` (grouped). Pick the per-plugin
  GHCR style for individual plugins (matches `presets/README.md:92`
  precedent); pick the grouped Quay style only when an upstream image
  bundles multiple plugins. Confirm with whoever owns the
  export-overlays publish pipeline before committing.
- **For each Phase 1 plugin, does an OCI tag pinned to `bs_1.49.4`
  already exist?** Verify with `skopeo list-tags` per image. If only
  later tags exist, that's a Phase 1 blocker — coordinate with
  `export-overlays` maintainers to backport.
- **Phase 2 option choice.** Recommendation is Option B (add a publish
  workflow inside this repo), but the user may prefer A or C for
  reasons not captured here. Confirm before starting Phase 2.

## Next steps

1. **Read** `docs/PROJECT_CONTEXT.md`, then
   `docs/DYNAMIC_PLUGINS_ARCHITECTURE.md`, then
   `docs/adr/011-frontend-design-system.md`. Do this even if you think
   you have the gist from this handoff. The ADR-011 lessons are
   non-obvious and recur every time someone exports a frontend plugin.
2. **Verify state at HEAD.** Re-run the grep commands at the top of
   "Current state". The file paths and counts in this handoff are
   accurate as of `c586ae3`.
3. **Inventory OCI images that already exist** for each Phase 1
   plugin:
   ```bash
   for img in backstage-community-plugin-rbac backstage-community-plugin-tech-radar-dynamic \
              backstage-community-plugin-azure-devops-dynamic \
              backstage-community-plugin-jenkins-backend-dynamic \
              backstage-community-plugin-sonarqube-dynamic \
              backstage-community-plugin-github-actions-dynamic; do
     echo "=== $img ==="
     skopeo list-tags docker://ghcr.io/veecode-platform/devportal-plugin-export-overlays/$img 2>&1 \
       | jq -r '.Tags[]?' | grep "^bs_1.49.4" | tail -3
   done
   ```
4. **Open Phase 1 PR**: swap one plugin first (e.g.,
   `backstage-community-plugin-rbac`), verify locally, push. Iterate
   one plugin per commit, in the same PR.
5. After Phase 1 merges: **delete the corresponding wrappers** in a
   second PR (separate so the swap is reversible).
6. **Coordinate with user on Phase 2 option** (A / B / C). Don't
   start Phase 2 until that choice is made.
7. **Phase 2** as scoped above (one PR per plugin or grouped).
8. **Phase 3** — delete `dynamic-plugins/wrappers/`, audit siblings,
   update docs.

## Risks

- **OCI image for some Phase 1 plugin doesn't exist at the right
  Backstage version.** Mitigation: file an issue in
  `devportal-plugin-export-overlays` for a backport; in the interim
  skip that plugin in Phase 1, document the gap. Don't fork the plugin
  source as a workaround.
- **Theme migration breaks.** `veecode-platform-plugin-veecode-theme`
  is a frontend plugin with CSS imports. The recurring lessons in
  ADR-011 § "Lições críticas" (rhdh-cli, `sideEffects`, peer deps, theme
  id collision) all apply when republishing it as OCI. Validate by
  setting `VEECODE_PRESETS=recommended,veecode-theme` and visually
  confirming MUI overrides apply in browser dev tools:
  `getComputedStyle(MuiButton) → { textTransform: 'none', borderRadius: '8px' }`.
- **Marketplace breakage cascades.** The `cbme` stopgap is *required*
  for the marketplace catalog tab. Don't disrupt it as a side effect.
- **First-boot pull latency.** Image starts pulling plugin OCI images
  at boot. On cold instances this adds ~10-30s. Mitigate by ensuring
  `pluginCachePath` is configured if container memory permits.
- **Validation feedback loop is slow.** No build-check workflow; only
  the full `docker build .` (~25 min cold) validates the
  Dockerfile + plugin assembly end-to-end. Run smoke tests locally with
  `scripts/dev-run.sh` (which bind-mounts and avoids the rebuild) when
  iterating on `dynamic-plugins.default.yaml`.

## Files / resources involved

| Path | Role |
|---|---|
| `dynamic-plugins.default.yaml` | The default plugin manifest. Every `package:` line is a migration target. |
| `presets/*.yaml` | Preset YAMLs. Plugin references inside `plugins:` blocks must swap. |
| `Dockerfile` lines 197-215 | Pre-install loop. Shrinks to empty / disappears at end of migration. |
| `Dockerfile` lines 246-264 | `cbme` stopgap. **Out of scope** — do not touch. |
| `dynamic-plugins/wrappers/*` | 15 wrapper directories. Each gets deleted as its plugin is OCI-published. |
| `docker/install-dynamic-plugins.py` | Runtime OCI puller. Read but don't modify (well-tested). |
| `entrypoint.sh` lines 98-158 | Preset resolver. Read but don't modify. |
| `scripts/dev-run.sh` | Local validation loop. Use it; smoke-test the image after each migration step. |
| `docs/DYNAMIC_PLUGINS_ARCHITECTURE.md` | Update at the end of Phase 3 to reflect new reality. |
| `docs/PROJECT_CONTEXT.md` | Update at the end of Phase 3. |
| `CLAUDE.md` | Update "Dynamic Plugins" section at end of Phase 3. |

## Links

- Repo: `https://github.com/veecode-platform/devportal-platform`
- Sibling repo (where most plugin OCI images come from):
  `https://github.com/veecode-platform/devportal-plugin-export-overlays`
- Existing OCI publish workflow (study before authoring a new one):
  `devportal-plugin-export-overlays/.github/workflows/publish-workspace-plugins.yaml`
- Previous handoff (docs authoring; useful as a tone reference):
  `.github/prompts/docs-refresh.md`
- Greenfield bootstrap plan (history of how this repo came to be):
  `/home/gio/.claude/plans/abundant-knitting-cloud.md`

## Suggested resumption prompt

```
Resuming the OCI-default migration on `veecode-platform/devportal-platform`.

State: main is at <verify with `git log --oneline -1`>. No work started on
this objective yet. Phase 1 (RHDH/community plugins already publishing OCI
via export-overlays) is unblocked and is the right starting point.

Locked decisions:
- Backstage 1.49.4 (don't bump).
- registry.access.redhat.com for UBI (don't touch).
- rhdh-cli, not janus-cli, for plugin export.
- cbme stopgap (Dockerfile:246-264) stays; out of scope.
- No build-check workflow; build only on manual publish.yml dispatch.

Immediate next steps:
1. Read docs/PROJECT_CONTEXT.md, docs/DYNAMIC_PLUGINS_ARCHITECTURE.md,
   and docs/adr/011-frontend-design-system.md.
2. Run the OCI image inventory loop in `.github/prompts/oci-default-migration.md`
   § "Next steps" #3 to confirm which Phase 1 plugins already have
   bs_1.49.4 OCI tags published.
3. Open a Phase 1 PR migrating one plugin (start with
   `backstage-community-plugin-rbac`). Validate locally via
   `docker build .` + `scripts/dev-run.sh run` + healthcheck. Iterate one
   plugin per commit, all in one PR.

The full sequence (phases 1 → 2 → 3) is in
`.github/prompts/oci-default-migration.md`. Stay inside its scope and
hard rules. Confirm Phase 2 option (A/B/C) with the user before starting
Phase 2.
```

---
Sources
- used: conversation, git_local, filesystem (devportal-platform + devportal-plugin-export-overlays)
- missing: none

Scope: devportal-platform `main` at commit c586ae3, plus a read-only
inspection of devportal-plugin-export-overlays for OCI publish pattern.
Generated: 2026-05-15.
