# Security Scan and Fix

The repo scans the published `veecode/devportal-platform` image for
known vulnerabilities and opens a PR with fixes that can be applied
in this repo's dependency graph. Most of the heavy lifting is done by
a scheduled GitHub Actions workflow that runs a Claude Code agent
end-to-end; this doc covers how it works and how to invoke it
manually.

## The workflow

[`.github/workflows/security-scan.yml`](../.github/workflows/security-scan.yml)
runs:

- **On schedule** — `0 10 * * 1-5` (10:00 UTC, weekdays).
- **On demand** — `workflow_dispatch` with optional `image_tag` input
  (defaults to `latest`).
- **After every publish** — Publish's final `trigger-security-scan` job
  dispatches this workflow explicitly (`workflow_dispatch -f
  image_tag=<version>`) with the exact version it just built, for both
  prerelease and stable tags. This is not a `workflow_run` trigger:
  GitHub suppresses `workflow_run` events for runs started by
  GITHUB_TOKEN-authored actions, and Publish itself is started that way
  by `release.yml`'s automated release path — a `workflow_run` listener
  would silently miss every automated release. Explicit dispatch (which
  IS allowed from GITHUB_TOKEN) avoids that gap and also avoids
  resolving the version from `package.json`, which can drift from what
  the triggering run actually published.

The workflow does three things:

1. Sets up Node 22 + Yarn 4.12.0 + installs Trivy.
2. Reads `.github/prompts/security-scan.md` as the agent prompt and
   invokes the Claude Code action against the prompt
   (`anthropics/claude-code-action@v1`) with model
   `claude-sonnet-4-6` and an explicit `--allowedTools` list.
3. If the agent opened a PR with fixes, triggers `pr-check.yml`
   against the new branch via `repository_dispatch` (`pr-validate`
   event), so the agent's branch picks up the standard
   tsc/lint/test gate.

The agent itself is what does the scanning, fixing, and PR-opening.
The repo workflow is glue.

## The agent's procedure

[`.github/prompts/security-scan.md`](../.github/prompts/security-scan.md)
is the full prompt. The procedure:

1. **Close previous security PR.** Any open
   `chore/security-fix-*` branch from a prior run is closed and its
   branch deleted, so the new run doesn't conflict.
2. **Baseline validation.** Runs `yarn install`, `yarn tsc`,
   `yarn lint:check`, `yarn build`, `yarn test` on clean main and
   records exit codes to `/tmp/logs/baseline.txt`. Used later to
   distinguish _pre-existing_ failures from _regressions caused by
   the fix_.
3. **Create branch.** `chore/security-fix-YYYY-MM-DD`.
4. **Security scan.** Pulls `veecode/devportal-platform:$IMAGE_TAG`,
   runs Trivy, splits the report into a main report (this repo's
   actionable vulns) and a plugins report (upstream-maintained
   dynamic plugins).
5. **Apply fixes.** Adds `resolutions:` to `package.json` for npm
   patch/minor bumps and updates `python/requirements.in` for
   pip-fixable Python vulns. Skips:
   - npm major bumps (documents only).
   - `@backstage/*` packages (use the Backstage upgrade track in
     [`UPGRADING.md`](UPGRADING.md) instead).
   - System (RHEL) packages — these need a UBI bump (Track 2 in
     [`UPGRADING.md`](UPGRADING.md)), not a code change.
   - Dynamic plugins — upstream responsibility.
   - Vulnerabilities with no fix yet.
6. **Post-fix validation.** Re-runs the full check set. Diffs against
   baseline. Any **regression** (a baseline-passing command now
   failing) is resolved by reverting the specific resolution that
   broke it and moving the CVE to "not fixed".
7. **Open PR.** Title is `chore: fix security vulnerabilities
(YYYY-MM-DD)`, or `[URGENT] chore: …` if any Critical/High CVEs
   were fixed. PR body lists the severity counts, fixed CVEs, not-fixed
   CVEs with reasons, and the validation result for each gate
   (pass / fail-regression / fail-pre-existing).

The agent ends silently if there are no vulnerabilities to fix.

## Severity policy

The prompt's defaults:

- **Critical / High** — fix automatically; PR title prefixed
  `[URGENT]`.
- **Medium** — fix automatically.
- **Low** — list in PR body only; leave unfixed.

## Manual scan

If you want to scan without the agent:

```bash
mkdir -p .trivyscan
trivy image --quiet --format json \
  veecode/devportal-platform:latest > .trivyscan/report.json

jq '[.Results[]? | .Vulnerabilities[]?
     | select(.FixedVersion != null and .FixedVersion != "")
     | {id: .VulnerabilityID, pkg: .PkgName, severity: .Severity,
        installed: .InstalledVersion, fixed: .FixedVersion}]' \
  .trivyscan/report.json
```

For separating main vs plugin vulnerabilities by hand:

```bash
jq '[.Results[]
     | .Vulnerabilities[]?
     | select(.PkgPath | contains("dynamic-plugins-root") | not)]' \
  .trivyscan/report.json > .trivyscan/main-report.json
```

The agent ships its own report scripts in-line; the repo doesn't
have a checked-in `.trivy/` helper directory (yet).

## Applying fixes by hand

For an npm vulnerability with a clean patch/minor bump:

```bash
yarn why <vulnerable-package>    # see who depends on it
```

If every consumer's declared range is compatible with the fixed
version's major, add a `resolutions:` entry to the **root** `package.json`:

```json
{
  "resolutions": {
    "<vulnerable-package>": "^<fixed-version>"
  }
}
```

Note: resolutions are _global_ — they override every consumer in the
tree. The agent's resolution safety gate calls this out: skip the
resolution if any consumer needs a different major, because the
incompatible consumer will break at runtime even if types compile.

For a Python vulnerability:

```bash
# Edit python/requirements.in to bump the version constraint
# Then re-pin:
source venv/bin/activate
pip-compile --output-file=python/requirements.txt python/requirements.in
```

For a UBI / system package vulnerability: there's nothing to do in
this repo. The fix lands in a newer UBI release; bump `NODE_BASE`
([`UPGRADING.md`](UPGRADING.md) § Track 2) when one is available.

## Validation gate

The agent treats the standard quality gate as load-bearing:

```bash
yarn install
yarn tsc
yarn lint:check
yarn build
yarn test
```

Any gate that **passed on clean main** must **also pass after the
fixes**. Any gate that _was already broken on main_ is documented as
pre-existing in the PR body and ignored — fixing CVEs is not the
window to fix unrelated failing tests.

## Reviewing a security PR

The PR body lists:

- Severity counts before vs after.
- CVEs fixed with version bumps.
- CVEs left unfixed with reasons (major bump, no fix yet, upstream
  responsibility, regression risk).
- Validation results.
- Manual attention items (e.g. a major bump deferred for a separate PR).

Review focus, in order:

1. **`resolutions:` changes.** Each one widens the global override
   surface. Confirm the new version's major matches every consumer.
2. **Python requirements.** Confirm the new version doesn't break
   mkdocs / techdocs rendering.
3. **Validation diff vs baseline.** All gates should be green or
   "pre-existing".
4. **CVE reasoning.** Anything moved to "not fixed" should have a
   reason that holds up (not just "skipped").

After merge, the security workflow will re-evaluate on its next
scheduled run and open a fresh PR if more fixes are possible.

## Reading list

- [Trivy docs](https://trivy.dev)
- [`.github/prompts/security-scan.md`](../.github/prompts/security-scan.md)
  — the canonical agent procedure.
- [`UPGRADING.md`](UPGRADING.md) — when the right fix is a Backstage
  bump (Track 1) or a UBI bump (Track 2) rather than a resolution.
