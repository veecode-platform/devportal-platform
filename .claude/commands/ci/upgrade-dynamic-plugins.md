# Dynamic Plugin Wrapper Upgrade (Automated)

Check for available upgrades for dynamic plugin wrappers and automatically
apply all patch and minor upgrades. Major upgrades are skipped and reported.

## Output management

Redirect verbose command output to temporary log files. Check the exit
code to determine success or failure. Inspect log file contents only when
a command exits with non-zero status.

    mkdir -p /tmp/logs
    cd dynamic-plugins && yarn install > /tmp/logs/dynamic-install.log 2>&1

## Steps

1. **List all wrapper folders**:

   ```bash
   ls -d dynamic-plugins/wrappers/*/
   ```

2. **For each wrapper folder**, read the `package.json` and extract:

   - The wrapper `name` field
   - The `dependencies` that match Backstage packages (starting with `@backstage-community/` or `@backstage/`)

3. **Check all dependencies in a single script**:

   Fetch latest versions for all extracted dependencies in one pass:

   ```bash
   for PKG in <list-of-dependencies>; do
     ENCODED=$(echo "$PKG" | sed 's/@/%40/; s|/|%2F|')
     LATEST=$(curl -s "https://registry.npmjs.org/$ENCODED" | jq -r '.["dist-tags"].latest')
     echo "$PKG $LATEST"
   done
   ```

4. **Compare versions and classify**:

   For each dependency, compare the installed version (stripped of `^` or
   `~` prefix) with the latest:
   - **patch**: only the patch version changed (e.g., 1.2.3 → 1.2.4)
   - **minor**: the minor version changed (e.g., 1.2.3 → 1.3.0)
   - **major**: the major version changed (e.g., 1.2.3 → 2.0.0) — skip, list for PR body
   - **up to date**: no change

5. **Apply patch and minor upgrades**:

   For each eligible upgrade, use the `Edit` tool to update the version in
   the corresponding wrapper `package.json` under
   `dynamic-plugins/wrappers/<wrapper-name>/package.json`. Preserve the
   `^` prefix.

6. **Run yarn install and verify**:

   After all upgrades are applied, run from the `dynamic-plugins` folder:

   ```bash
   cd dynamic-plugins && yarn install
   ```

   Confirm exit code is 0 before reporting success.

7. **Upgrade downloaded dynamic plugins**:

   Read `dynamic-plugins/downloads/plugins.json`. This file contains
   plugins with exact pinned versions (no `^` or `~` prefix):

   ```json
   {
       "plugins": [
           { "name": "@veecode-platform/plugin-veecode-homepage-dynamic", "version": "1.0.1" }
       ]
   }
   ```

   For each entry, fetch the latest version from npm:

   ```bash
   for PKG in <list-of-plugin-names>; do
     ENCODED=$(echo "$PKG" | sed 's/@/%40/; s|/|%2F|')
     LATEST=$(curl -sf "https://registry.npmjs.org/$ENCODED" | jq -r '.["dist-tags"].latest // empty')
     [ -n "$LATEST" ] && echo "$PKG $LATEST" || echo "WARN: failed to fetch $PKG" >&2
   done
   ```

   Compare using the same semver classification from step 4 (patch/minor
   = apply, major = skip). Use the `Edit` tool to update the `version`
   field in `plugins.json`. Unlike wrappers, these are exact versions —
   do NOT add `^` or `~` prefix.

   Example:
   ```
   Before: "version": "1.0.1"
   After:  "version": "1.0.2"
   ```

8. **Report results**:

   Output a summary with:
   - Table of applied wrapper upgrades (wrapper, dependency, old version, new version)
   - Table of applied download upgrades from `plugins.json` (plugin name, old version, new version)
   - List of skipped major upgrades (source, package, current, available)
   - yarn install: pass / fail
