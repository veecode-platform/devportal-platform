# Static Plugin Upgrade Checker

Check for available upgrades for static plugins in the app and backend packages by querying npm registry, then apply selected upgrades.

## Steps

1. **Read package.json files**:

   Read both `packages/app/package.json` and `packages/backend/package.json` to extract dependencies.

2. **Filter eligible packages**:

   From both `dependencies` and `devDependencies`, filter packages whose names start with any of these prefixes:

   - `@backstage-community/plugin-catalog-backend-module`
   - `@backstage-community/plugin-scaffolder-backend-module`
   - `@roadiehq/scaffolder`

3. **For each eligible package**, fetch the latest version from npm registry:

   Use the npm registry API to get package metadata:

   ```bash
   curl -s "https://registry.npmjs.org/<package-name>" | jq -r '.["dist-tags"].latest'
   ```

   Replace `<package-name>` with the scoped package name (e.g., `@backstage/plugin-auth-backend-module-github-provider` becomes `@backstage%2Fplugin-auth-backend-module-github-provider` in the URL).

4. **Compare versions** and build a report:

   For each eligible package, compare the installed version (from `dependencies` field) with the latest available version. Show a summary table:

   | Package File | Package                                         | Current | Latest | Status            |
   | ------------ | ----------------------------------------------- | ------- | ------ | ----------------- |
   | app          | @backstage/plugin-auth-backend-module-github    | 0.3.0   | 0.4.0  | Upgrade available |
   | backend      | @backstage/plugin-catalog-backend-module-github | 0.12.0  | 0.12.0 | Up to date        |

5. **Ask user to select upgrades**:

   If there are available upgrades, use `AskUserQuestion` with `multiSelect: true` to let the user choose which upgrades to apply. Each option should show the package name and version change (e.g., `@backstage/plugin-auth-backend-module-github: 0.3.0 → 0.4.0`).

   If no upgrades are available, inform the user that all dependencies are up to date and skip to the end.

6. **Apply selected upgrades**:

   For each selected upgrade, use the `Edit` tool to update the version in the corresponding `package.json` file (`packages/app/package.json` or `packages/backend/package.json`).

   Update the dependency version in the `dependencies` or `devDependencies` object, preserving the `^` or `~` prefix (e.g., change `"^0.3.0"` to `"^0.4.0"`).

7. **Run yarn install**:

   After all selected upgrades are applied, run yarn install from the root folder:

   ```bash
   yarn install
   ```

8. **Report results**:

   Summarize what was upgraded and confirm yarn install completed successfully.

## Notes

- The npm registry URL for scoped packages requires URL encoding: `@scope/package` becomes `@scope%2Fpackage`
- Only check packages that match the allowed prefixes listed above
- Strip the `^` or `~` prefix from version strings when comparing
- If a package appears in multiple files, show each on a separate row
- Always preserve the `^` or `~` prefix when updating versions
- Run `yarn install` only once after all upgrades are applied, from the repository root
