# Static Plugin Upgrade (Automated)

Check for available upgrades for static plugins and automatically apply
all patch and minor upgrades. Major upgrades are skipped and reported.

## Output management

Redirect verbose command output to temporary log files. Check the exit
code to determine success or failure. Inspect log file contents only when
a command exits with non-zero status.

    mkdir -p /tmp/logs
    yarn install > /tmp/logs/install.log 2>&1

## Steps

1. **Read package.json files**:

   Read both `packages/app/package.json` and `packages/backend/package.json` to extract dependencies.

2. **Filter eligible packages**:

   From both `dependencies` and `devDependencies`, filter packages whose names start with any of these prefixes:

   - `@backstage-community/plugin-catalog-backend-module`
   - `@backstage-community/plugin-scaffolder-backend-module`
   - `@roadiehq/scaffolder`

3. **Check all eligible packages in a single script**:

   Fetch latest versions and classify upgrades in one pass to minimize
   tool calls and context usage:

   ```bash
   for PKG in <list-of-eligible-packages>; do
     ENCODED=$(echo "$PKG" | sed 's/@/%40/; s|/|%2F|')
     LATEST=$(curl -s "https://registry.npmjs.org/$ENCODED" | jq -r '.["dist-tags"].latest')
     echo "$PKG $LATEST"
   done
   ```

4. **Compare versions and classify**:

   For each eligible package, compare the installed version (stripped of
   `^` or `~` prefix) with the latest:
   - **patch**: only the patch version changed (e.g., 1.2.3 → 1.2.4)
   - **minor**: the minor version changed (e.g., 1.2.3 → 1.3.0)
   - **major**: the major version changed (e.g., 1.2.3 → 2.0.0) — skip, list for PR body
   - **up to date**: no change

5. **Apply patch and minor upgrades**:

   For each eligible upgrade, use the `Edit` tool to update the version in
   the corresponding `package.json` file. Preserve the `^` or `~` prefix.

6. **Run yarn install and verify**:

   After all upgrades are applied, run from the repository root:

   ```bash
   yarn install
   ```

   Confirm exit code is 0 before reporting success.

7. **Report results**:

   Output a summary with:
   - Table of applied upgrades (package, old version, new version)
   - List of skipped major upgrades (package, current version, available major version)
   - yarn install: pass / fail
