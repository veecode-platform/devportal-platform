# Plugin Upgrade Checker

Check for available upgrades for dynamic plugin wrappers by querying npm registry, then apply selected upgrades.

## Steps

1. **List all wrapper folders**:

   Get all directories under `dynamic-plugins/wrappers/`:

   ```bash
   ls -d dynamic-plugins/wrappers/*/
   ```

2. **For each wrapper folder**, read the `package.json` and extract:

   - The wrapper `name` field
   - The wrapper `version` field
   - The `dependencies` that match Backstage community plugins (packages starting with `@backstage-community/` or `@backstage/`)

3. **For each dependency package**, fetch the latest version from npm registry:

   Use the npm registry API to get package metadata:

   ```bash
   curl -s "https://registry.npmjs.org/<package-name>" | jq -r '.["dist-tags"].latest'
   ```

   Replace `<package-name>` with the scoped package name (e.g., `@backstage-community/plugin-rbac` becomes `@backstage-community%2Fplugin-rbac` in the URL).

4. **Compare versions** and build a report:

   For each wrapper, compare the installed dependency version (from `dependencies` field) with the latest available version. Show a summary table:

   | Wrapper                               | Dependency                             | Current | Latest | Status            |
   | ------------------------------------- | -------------------------------------- | ------- | ------ | ----------------- |
   | backstage-community-plugin-rbac       | @backstage-community/plugin-rbac       | 1.47.0  | 1.49.4 | Upgrade available |
   | backstage-community-plugin-tech-radar | @backstage-community/plugin-tech-radar | 1.13.0  | 1.13.0 | Up to date        |

5. **Ask user to select upgrades**:

   If there are available upgrades, use `AskUserQuestion` with `multiSelect: true` to let the user choose which upgrades to apply. Each option should show the package name and version change (e.g., `@backstage-community/plugin-rbac: 1.47.0 → 1.49.4`).

   If no upgrades are available, inform the user that all dependencies are up to date and skip to the end.

6. **Apply selected upgrades**:

   For each selected upgrade, use the `Edit` tool to update the version in the corresponding `package.json` file under `dynamic-plugins/wrappers/<wrapper-name>/package.json`.

   Update the dependency version in the `dependencies` object, preserving the `^` prefix (e.g., change `"^1.47.0"` to `"^1.49.4"`).

7. **Run yarn install**:

   After all selected upgrades are applied, run yarn install from the `dynamic-plugins` folder:

   ```bash
   cd dynamic-plugins && yarn install
   ```

8. **Upgrade downloaded dynamic plugins**:

   Read `dynamic-plugins/downloads/plugins.json`. This file contains
   plugins with exact pinned versions (no `^` or `~` prefix):

   ```json
   {
       "plugins": [
           { "name": "@veecode-platform/plugin-veecode-homepage-dynamic", "version": "1.0.1" }
       ]
   }
   ```

   For each entry, fetch the latest version from npm registry:

   ```bash
   for PKG in <list-of-plugin-names>; do
     ENCODED=$(echo "$PKG" | sed 's/@/%40/; s|/|%2F|')
     LATEST=$(curl -sf "https://registry.npmjs.org/$ENCODED" | jq -r '.["dist-tags"].latest // empty')
     [ -n "$LATEST" ] && echo "$PKG $LATEST" || echo "WARN: failed to fetch $PKG" >&2
   done
   ```

   Show a summary table:

   | Plugin Name                                          | Current | Latest | Status            |
   | ---------------------------------------------------- | ------- | ------ | ----------------- |
   | @veecode-platform/plugin-veecode-homepage-dynamic    | 1.0.1   | 1.0.2  | Upgrade available |

   If there are available upgrades, use `AskUserQuestion` with
   `multiSelect: true` to let the user choose which to apply. Update the
   `version` field in `plugins.json` for each selected upgrade. Unlike
   wrappers, these are exact versions — do NOT add `^` or `~` prefix.

   Example:
   ```
   Before: "version": "1.0.1"
   After:  "version": "1.0.2"
   ```

9. **Report results**:

   Summarize what was upgraded (wrappers and downloads) and confirm yarn
   install completed successfully.

## Notes

- The npm registry URL for scoped packages requires URL encoding: `@scope/package` becomes `@scope%2Fpackage`
- Only check wrapper dependencies that are Backstage-related (starting with `@backstage-community/` or `@backstage/`)
- Downloaded plugins in `plugins.json` use exact pinned versions (no `^` or `~` prefix)
- Strip the `^` or `~` prefix from version strings when comparing wrapper dependencies
- If a wrapper has multiple Backstage dependencies, show each on a separate row
- Always preserve the `^` or `~` prefix when updating wrapper dependency versions
- Run `yarn install` only once after all upgrades are applied, from the `dynamic-plugins` folder (not from individual wrapper folders)
