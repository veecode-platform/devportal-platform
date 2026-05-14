Remediate known vulnerabilities identified by Trivy security scans:

## Prerequisites

- Run `/security-scan` first to generate the split reports
- This skill uses `.trivyscan/main-report.json` (DevPortal base vulnerabilities only)
- Dynamic plugin vulnerabilities (in `plugins-report.json`) are ignored - they are maintained by upstream projects

## Steps

1. **Parse vulnerability report**:

   Read `.trivyscan/main-report.json` and identify actionable vulnerabilities:

   - npm packages with available fixes (fixable via Yarn resolutions)
   - Python packages with available fixes (fixable via requirements.in)
   - Skip system packages (RHEL/UBI) - not actionable

2. **For npm vulnerabilities**:

   Add resolutions to `package.json` under the `resolutions` block:

   ```json
   "resolutions": {
     "vulnerable-package": "^fixed.version"
   }
   ```

   **CRITICAL — How Yarn resolutions work:**

   A resolution overrides the resolved version for EVERY consumer in the
   entire dependency tree, not just the direct dependency. If package A
   requires `foo@^3.0.0` and package B requires `foo@^9.0.0`, a resolution
   `"foo": "^10.0.0"` forces BOTH to use v10 — even if A's code relies on
   the v3 API (e.g., different export style, removed methods, renamed
   options). This breaks A at runtime.

   **Before adding each resolution, follow this reasoning chain:**

   1. Identify the fixed version Trivy recommends (e.g., `10.2.1`).
   2. Run: `yarn why <package>` to list every consumer and the version
      range each one declares.
   3. Compare the major version of the fix against each consumer's range.
      If ANY consumer requires a different major version, the resolution
      will break that consumer. Skip it.
   4. Only add the resolution when every consumer's declared range is
      compatible with the fixed version's major (e.g., all require `^10`
      and fix is `10.2.1`).

   **Constraints:**

   - **NEVER add resolutions for `@backstage/*` packages** — these must
     only be updated via the Backstage upgrade process.
   - Only add resolutions when the fix stays within the same major version
     as every existing consumer in the tree.
   - When the fix crosses a major boundary for any consumer, skip the
     resolution and document it as "fix requires major version bump —
     incompatible with transitive consumers".

3. **For Python vulnerabilities**:

   Update constraints in `python/requirements.in`:

   ```pre
   package>=fixed.version
   ```

   Then regenerate:

   ```bash
   source venv/bin/activate && pip-compile --output-file=python/requirements.txt python/requirements.in
   ```

4. **Deduplicate and verify**:

   ```bash
   yarn dedupe
   yarn install
   yarn tsc
   yarn lint:check
   yarn build
   yarn test
   ```

   If any command fails, identify which resolution caused it and revert
   that resolution. Move the associated CVE to "skipped" with the reason.

5. **Report results**:

   Provide a summary of:

   - Vulnerabilities fixed (package, old version, new version)
   - Vulnerabilities skipped (and why: major bump, system package, no fix available)
   - Fixes applied and skipped

## Vulnerability Categories

| Type              | Action                 | Notes                           |
| ----------------- | ---------------------- | ------------------------------- |
| npm (patch/minor) | Add to resolutions     | Safe to fix                     |
| npm (major)       | Document only          | Requires upgrade coordination   |
| Python (pip)      | Update requirements.in | Run pip-compile after           |
| System (RHEL)     | Skip                   | Requires upstream Red Hat fixes |
| Dynamic plugins   | Skip                   | Maintained by upstream projects |
| No fix available  | Skip                   | Monitor for future fixes        |

## Example Resolutions

```json
"resolutions": {
  "qs": "^6.14.1",
  "jws": "^3.2.3",
  "undici": "7.16.0"
}
```

## Notes

- Always verify that resolutions pass validation before finalizing
- Track skipped vulnerabilities for future Backstage upgrades
