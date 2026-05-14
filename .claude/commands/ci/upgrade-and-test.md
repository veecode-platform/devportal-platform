# Backstage Upgrade with Automated Validation

Perform a Backstage upgrade cycle with build validation.
This is the CI version — build and type-check only. Visual regression is
handled separately by the orchestrator prompt.

## Output management

Redirect verbose command output to temporary log files. Check the exit
code to determine success or failure. Inspect log file contents only when
a command exits with non-zero status.

    mkdir -p /tmp/logs
    yarn install > /tmp/logs/install.log 2>&1

## Steps

1. **Run the upgrade**:

   ```bash
   yarn update-backstage
   ```

2. **Check for actual upgrades**:

   ```bash
   git status --porcelain backstage.json '**/package.json'
   ```

   If no files were modified, report: "No Backstage upgrade available.
   All packages are already at the latest version." and return to the
   orchestrator — remaining steps in this file are complete.

3. **Install dependencies**:

   ```bash
   yarn install
   ```

4. **Type check**:

   ```bash
   yarn tsc
   ```

   If tsc fails, identify the error type and follow the error policy below.

5. **Build**:

   ```bash
   yarn build
   ```

   Success criteria: both `yarn tsc` and `yarn build` exit with code 0.

6. **Report results**:

   Output a summary with:
   - Previous and new Backstage version (read from `backstage.json` before and after)
   - yarn tsc: pass / fail
   - yarn build: pass / fail
   - Any duplicate installation warnings encountered

## Error policy

When tsc or build fails, reason through it step by step:

1. Read the error output and classify the error type.
2. Apply the matching action:

   | Error type | Action |
   |---|---|
   | "duplicate installation" warnings | Run `yarn dedupe`, then `yarn install`, then `yarn tsc` again |
   | Import errors (module moved/renamed) | Adjust the imports to the new location |
   | Type errors from deprecated API with documented replacement | Apply the documented migration |
   | Complex type errors (no clear replacement, signature changes across multiple files) | Revert Backstage changes and document errors in output |

3. After applying a fix, re-run the failing command to confirm it passes.
