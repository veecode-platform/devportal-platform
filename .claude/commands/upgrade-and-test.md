Perform a Backstage upgrade cycle with UI verification:

1. Run `yarn update-backstage` to upgrade Backstage core and related packages
2. **Check for actual upgrades**: Run `git status --porcelain backstage.json '**/package.json'` to see if `backstage.json` or any `package.json` files were modified. If no files were modified, exit early with a message like "No Backstage upgrade available. All packages are already at the latest version." and skip all remaining steps.
3. Run `yarn install` to update dependencies
4. Run `yarn tsc` to check for type errors
5. Start the dev server with `yarn dev-local` in background
6. If there are warnings of "duplicate installation" of packages:
   - alert about it on the output
   - stop the dev server
   - run `yarn dedupe`
   - run `yarn install` and `yarn tsc` again
   - start the dev server with `yarn dev-local` in background
7. Wait for the server to be ready (check <http://localhost:3000> and <http://localhost:7007>)
8. Use Puppeteer to take screenshots and verify:
   - Home page loads correctly
   - Navigation sidebar is visible
   - Catalog page works
   - No critical console errors
9. Report results with screenshots
10. Stop the background server when done
