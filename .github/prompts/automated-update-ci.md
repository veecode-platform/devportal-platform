You are an automated maintenance agent for the devportal-base repository.

Your scope is EXCLUSIVELY the devportal-base repository. You MUST NOT
reference, modify, or consider any other repository. There is no distro,
plugins, samples, or parent in your context.

## Objective

Check for available updates to devportal-base components, apply them,
validate, and open a PR for human review.

## High-level flow

1. Close previous automated PR
2. Capture baseline validation on clean main
3. Create branch
4. Apply updates (base image → Backstage core → static plugins → dynamic plugins)
5. Final validation — compare against baseline, resolve regressions
6. Visual regression (if build succeeded)
7. Open PR (only if changes were made and no regressions)

## Output management

Redirect verbose command output (yarn install, yarn tsc, yarn build,
yarn test, yarn lint:check) to temporary log files. Check the exit code
to determine success or failure. Inspect log file contents only when a
command exits with non-zero status.

    mkdir -p /tmp/logs
    yarn install > /tmp/logs/install.log 2>&1

This keeps the conversation context clean for reasoning about errors and
visual regression analysis. Apply this pattern to every yarn/build command
throughout all steps below.

## Step 1 — Pre-flight: close previous automated PR

Before creating a new branch, close any leftover automated-update PR so its
branch does not conflict:

```bash
gh pr list --state open --json headRefName,number \
  --jq '.[] | select(.headRefName | startswith("chore/automated-update-")) | .number' \
  | while read -r PR_NUM; do
      gh pr close "$PR_NUM" --delete-branch
    done
```

## Step 2 — Baseline validation

Before creating a branch or applying any updates, save the start timestamp
and run validation on clean main:

```bash
mkdir -p /tmp/logs
date +%s > /tmp/logs/start_time.txt
yarn install > /tmp/logs/baseline-install.log 2>&1; echo "install=$?" >> /tmp/logs/baseline.txt
yarn tsc > /tmp/logs/baseline-tsc.log 2>&1; echo "tsc=$?" >> /tmp/logs/baseline.txt
yarn lint:check > /tmp/logs/baseline-lint.log 2>&1; echo "lint=$?" >> /tmp/logs/baseline.txt
yarn build > /tmp/logs/baseline-build.log 2>&1; echo "build=$?" >> /tmp/logs/baseline.txt
yarn test > /tmp/logs/baseline-test.log 2>&1; echo "test=$?" >> /tmp/logs/baseline.txt
```

Save these results for later comparison. Read log files only during
the final validation comparison step, and only for commands that regressed.

## Step 3 — Branch

Create a branch from main: chore/automated-update-YYYY-MM-DD

## Step 4 — Update sequence

Execute each sub-step in order. Each sub-step that produces changes must
result in a separate commit with a descriptive message.

**Committing changes**: Each step runs deterministic scripts or tools that
modify files in the working tree. When committing after a step, always use
`git add -A && git commit -m "<message>"` to capture every change the step
produced.

### 4a: UBI10 base image

Follow the process described in .claude/commands/update-base-image.md using strictly the --no-build flag.

Success criteria: script executed and reported whether an update exists.
If updated: `git add -A && git commit -m "chore: update UBI10 base image to <tag>"`

### 4b: Backstage core

Follow the process described in .claude/commands/ci/upgrade-and-test.md

If update succeeded: `git add -A && git commit -m "chore: upgrade backstage core to <version>"`

### 4c: Static plugins

Follow the process described in .claude/commands/ci/upgrade-static-plugins.md

After applying, run yarn tsc.
If tsc fails, apply this error policy:
- Import errors (module moved/renamed): attempt to fix by adjusting imports
- Type errors from deprecated API with documented replacement: apply the migration
- Complex type errors (no clear replacement, signature changes across multiple files):
  revert the static plugin changes, document errors in output
- "duplicate installation" warnings: run yarn dedupe, yarn install, and yarn tsc again

If upgrades were applied: `git add -A && git commit -m "chore: upgrade static plugins"`

### 4d: Dynamic plugins

Follow the process described in .claude/commands/ci/upgrade-dynamic-plugins.md

After applying, run cd dynamic-plugins && yarn install.

If upgrades were applied: `git add -A && git commit -m "chore: upgrade dynamic plugin wrappers"`

## Step 5 — Final validation

After all update steps, if any commits were made, run validation and save
exit codes:

```bash
rm -f /tmp/logs/postfix.txt
yarn install > /tmp/logs/postfix-install.log 2>&1; echo "install=$?" >> /tmp/logs/postfix.txt
yarn tsc > /tmp/logs/postfix-tsc.log 2>&1; echo "tsc=$?" >> /tmp/logs/postfix.txt
yarn lint:check > /tmp/logs/postfix-lint.log 2>&1; echo "lint=$?" >> /tmp/logs/postfix.txt
yarn build > /tmp/logs/postfix-build.log 2>&1; echo "build=$?" >> /tmp/logs/postfix.txt
yarn test > /tmp/logs/postfix-test.log 2>&1; echo "test=$?" >> /tmp/logs/postfix.txt
```

Compare against baseline:

```bash
diff /tmp/logs/baseline.txt /tmp/logs/postfix.txt
```

### How to interpret the diff

- **No diff**: all results match baseline. Proceed to Step 6.
- **A command was already non-zero in baseline and remains non-zero**: this
  is **pre-existing**. Document as such in the PR body.
- **A command changed from exit 0 to non-zero**: this is a **regression
  introduced by your updates**. Follow the regression resolution process below.

### Regression resolution

When a command regressed, reason through it step by step:

1. Read the failing post-fix log to identify the error message.
2. Determine which update step introduced the failure (check git log
   for the most recent commits and correlate with the error).
3. Attempt to fix the issue (adjust imports, apply migration, run dedupe).
4. If unable to fix, identify the SHA of the commit that caused the
   regression from `git log --oneline` and revert it with `git revert <SHA>`.
   Document the reverted update under "Errors encountered" in the PR body.
5. Re-run the full validation block above (re-create postfix.txt).
6. Run `diff /tmp/logs/baseline.txt /tmp/logs/postfix.txt` again.
7. Repeat until no regressions remain.

Only proceed to Step 6 once every command that passed in baseline also
passes after your changes.

### Build output reference

`yarn build` produces `packages/backend/dist/` containing:
- `bundle.tar.gz` and `skeleton.tar.gz` — Docker packaging artifacts
- `index.js` — the runnable backend entry point

The tarballs are **not** the final build format. They coexist with the
executable `index.js`. The server starts normally via
`node packages/backend/dist/index.js` regardless of tarball files being
present. Do NOT skip Step 6 — Visual regression because of them.

## Step 6 — Visual regression

Run this step only if build succeeded (build exit code = 0 in postfix.txt).
Run it even if other commands (test, lint) failed.

Start the built app in background:

```bash
RBAC_POLICY_PATH=$(pwd)/rbac-policy.csv node packages/backend/dist/index.js &
```

Wait for the server to be ready in two phases:

**Phase 1 — HTTP server up**: poll http://localhost:7007 with curl until it
responds (max 60 seconds).

**Phase 2 — Catalog API ready**: the backend uses in-memory SQLite and
ingests example entities from `examples/` on every startup. The catalog API
becomes available a few seconds after HTTP is up. Poll it:

```bash
for i in $(seq 1 30); do
  if curl -sf http://localhost:7007/api/catalog/entity-facets?facet=kind > /dev/null 2>&1; then
    echo "Catalog API ready after ${i}s"
    break
  fi
  sleep 1
done
```

If the loop completes without a successful response, record catalog and
APIs visual checks as **fail**. A timeout here means the catalog backend
failed to start — treat it as a regression.

All screenshots go to `/tmp/visual-regression/`:

```bash
mkdir -p /tmp/visual-regression
```

### Pages to verify

| Page | URL | Screenshot |
|------|-----|------------|
| Home | `http://localhost:7007` | `/tmp/visual-regression/home.png` |
| Catalog | `http://localhost:7007/catalog` | `/tmp/visual-regression/catalog.png` |
| APIs | `http://localhost:7007/catalog?filters%5Bkind%5D=api` | `/tmp/visual-regression/apis.png` |

Use `agent-browser` (installed globally in this workflow) for each page.
Run each command via the Bash tool.

```bash
agent-browser open <URL>
agent-browser wait --load networkidle
agent-browser screenshot <screenshot-path>
agent-browser snapshot -i
```

Read each screenshot and assess it using the criteria below.

### Assessment criteria

Each page gets exactly one result: **pass**, **fail**, or **skipped**.

**Home → always skipped.** The `/` route is a dynamic plugin
(`plugin-veecode-homepage-dynamic`). Dynamic plugins are loaded from
`dynamic-plugins-root/`, which is empty in CI. Mark Home as `⏭️ skipped`
in the validation matrix. Still take the screenshot for the record.

**Catalog → pass when all three are true:**
1. Navigation sidebar is visible (left side)
2. "VeeCode Catalog" or equivalent header renders
3. Entity rows appear in the table (e.g., "5 catalog entries")

**Catalog → fail when any of these appear:**
- "Could not fetch catalog entities"
- Empty table with no rows
- Error screen or blank page

**APIs → pass when all three are true:**
1. Navigation sidebar is visible
2. Kind filter shows "API" selected
3. API entity rows appear in the table (e.g., "3 API entries")

**APIs → fail when any of these appear:**
- Same failure indicators as Catalog

### Why these criteria work

The backend always starts with in-memory SQLite and ingests
`examples/catalog-all.yaml` (which references entities, APIs, users,
groups, resources). After Phase 2 polling confirms the catalog API is
responding, entity data is always present. A missing entity table means
something broke in this upgrade.

### Describing results

When recording visual results for the PR body, state what you observed
concretely. Good descriptions reference visible data:

- `sidebar and 5 catalog entries visible`
- `3 API entries listed, kind filter renders`
- `catalog table renders but shows 0 entries` (this is a fail)

Vague descriptions like `renders correctly` or `page loads` are
insufficient — always mention the entity count or specific content.

Close browser and kill background server:

```bash
agent-browser close
kill %1 2>/dev/null || true
```

## Step 7 — Result

If no update step produced changes: exit silently, with no branch, PR,
or artifact.

If changes were made: open a PR using the structure and rules below.

### Pre-PR: collect metadata

Before composing the PR body, gather these values:

```bash
RUN_URL="https://github.com/veecode-platform/devportal-base/actions/runs/$GITHUB_RUN_ID"
BACKSTAGE_VERSION=$(cat backstage.json | grep -o '"version": "[^"]*"' | head -1 | cut -d'"' -f4)
START_TS=$(cat /tmp/logs/start_time.txt)
DURATION=$(( ($(date +%s) - START_TS) / 60 ))
```

Use `$RUN_URL`, `$BACKSTAGE_VERSION`, and `$DURATION` when filling in the
PR body below.

### PR body rules

Read ALL rules in this section before generating the PR body.

**Sections** (in order): header with metadata table, pipeline diagram,
dependency changes table, validation matrix, errors, manual attention,
footer.

**Pipeline diagram**: Mermaid `graph TB` with 3 phases:

1. **Scan phase**: fan-out from start node into 4 parallel scan nodes
   (UBI10, Backstage Core, Static Plugins, Dynamic Plugins). Each node
   shows its name and outcome on two lines using `<br/>`.
2. **Validation gate**: single hexagon node showing checks performed and
   pass count (`tsc · lint · build · test` + `N/4 pass`).
3. **Visual verification gate**: single hexagon node showing pages checked
   and pass count (`Catalog · APIs` + `N/2 pass`). Home is always skipped
   (dynamic plugin, not loaded in CI) — do not count it in the total.

Color coding (apply via `style` directives):
- `fill:#238636,color:#fff` — green: updated or pass
- `fill:#6e7681,color:#adbac7` — gray: no changes / skipped
- `fill:#da3633,color:#fff` — red: failed or reverted
- `fill:#1f2937,color:#e6edf3,stroke:#30363d` — dark: gate nodes (pass)
- `fill:#1f6feb,color:#fff,stroke:#388bfd` — blue: start node
- `fill:#238636,color:#fff,stroke:#2ea043` — green: final "PR Ready" node

If a scan step was reverted due to regression, color it red and label it
`⚠️ reverted — <reason>`. If a gate has failures, color it red instead
of dark. After the diagram, if any step was reverted or had errors, add a
blockquote explaining what happened and how the agent resolved it.

**Dependency changes table**: one row per changed package showing name,
previous version, updated version, and scope (base image / core / static /
dynamic wrapper). Omit rows for categories with no changes.

**Validation matrix**: one row per check.

Symbols: ✅ pass, ❌ fail, ⏭️ skipped (Home only).

Visual rows (Catalog, APIs) include a `[screenshot]($RUN_URL)` link and a
concrete description separated by ` · `. The description states what is
visible — include entity counts when present.

Examples of good visual row descriptions:
- `[screenshot](...) · sidebar and 5 catalog entries visible`
- `[screenshot](...) · 3 API entries listed`
- `[screenshot](...) · catalog table shows "Could not fetch" error` (fail)

Home row uses `⏭️ skipped` with reason `dynamic plugin not loaded in CI`.

If a screenshot could not be captured, write `no screenshot` in the Details
column.

**Footer**: always include the branding line exactly as shown in the example.

### Example PR body

Below is a complete example. Adapt all values to match this run's actual
results. The example shows the happy path; for failures, apply the color
rules above.

<!-- EXAMPLE START -->
## Automated Maintenance — YYYY-MM-DD

> Autonomous dependency management for VeeCode DevPortal.
> This PR was created, validated, and visually verified by an AI agent
> without human intervention.

### Pipeline

```mermaid
graph TB
    Start(["🔄 Automated Maintenance"])

    Start --> A & B & C & D

    A["UBI10 Base Image<br/>updated"]
    B["Backstage Core<br/>updated"]
    C["Static Plugins<br/>no changes"]
    D["Dynamic Plugins<br/>1 upgrade"]

    A & B & C & D --> V{{"Validation Gate<br/><i>tsc · lint · build · test</i><br/>4/4 pass ✅"}}

    V --> VR{{"Visual Verification<br/><i>Catalog · APIs</i><br/>2/2 pass ✅"}}

    VR --> Done(["✅ PR Ready for Review"])

    style A fill:#238636,color:#fff
    style B fill:#238636,color:#fff
    style C fill:#6e7681,color:#adbac7
    style D fill:#238636,color:#fff
    style V fill:#1f2937,color:#e6edf3,stroke:#30363d
    style VR fill:#1f2937,color:#e6edf3,stroke:#30363d
    style Start fill:#1f6feb,color:#fff,stroke:#388bfd
    style Done fill:#238636,color:#fff,stroke:#2ea043
```

### Dependency changes

| Package | Previous | Updated | Scope |
|---------|----------|---------|-------|
| UBI10 base image | `10.1-1772512434` | `10.1-1773117814` | base image |
| @backstage-community/plugin-rbac | `^1.49.0` | `^1.49.4` | dynamic wrapper |

### Validation matrix

| Check | Result | Details |
|-------|--------|---------|
| TypeScript | ✅ pass | — |
| Lint | ✅ pass | — |
| Build | ✅ pass | — |
| Tests | ✅ pass | — |
| Visual: Home | ⏭️ skipped | dynamic plugin not loaded in CI |
| Visual: Catalog | ✅ pass | [screenshot](https://github.com/veecode-platform/devportal-base/actions/runs/123456) · sidebar and 5 catalog entries visible |
| Visual: APIs | ✅ pass | [screenshot](https://github.com/veecode-platform/devportal-base/actions/runs/123456) · 3 API entries listed |

### Errors encountered
none

### Manual attention required
none

---
<sub>🤖 Generated by <a href="https://github.com/veecode-platform/devportal-base/blob/main/.github/workflows/automated-update.yml">VeeCode Automated Maintenance</a> · powered by Claude Code</sub>
<!-- EXAMPLE END -->

Mark the PR as ready for review.
