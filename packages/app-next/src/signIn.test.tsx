import { screen, waitFor } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { appSignInModule } from './App';

// renderTestApp disables the 'sign-in-page:app' extension by default
// (node_modules/@backstage/frontend-test-utils/dist/app/renderTestApp.esm.js)
// so ordinary page/route tests can skip the sign-in wall. Passing appSignInModule
// as a feature re-enables that same extension id with this app's own content:
// resolveAppNodeSpecs (node_modules/@backstage/frontend-defaults/node_modules/
// @backstage/frontend-app-api/dist/tree/resolveAppNodeSpecs.esm.js) lets a later
// module extension of the same id replace both the disabled flag and the content
// of an earlier plugin-level override, rather than erroring as a duplicate. That
// means this test exercises the real, unmodified sign-in gate
// (@backstage/plugin-app's extensions/AppRoot.esm.js: no SignInPageComponent ->
// auto-guest and skip straight to children; a SignInPageComponent -> render it
// and withhold children until onSignInSuccess fires) against this app's GitLab
// page, not a hand-rolled stand-in for it.
describe('appSignInModule replaces the default guest-only sign-in page', () => {
  it('shows the GitLab provider instead of guest', async () => {
    renderTestApp({
      features: [appSignInModule],
      initialRouteEntries: ['/'],
      // MultiSignInPage (core-components) unconditionally calls
      // configApi.getString('app.title'), which throws on the default mock
      // config (it only sets app.baseUrl/backend.baseUrl) — never hit by
      // existing tests because they all disable the sign-in page.
      config: {
        app: { title: 'Test App', baseUrl: 'http://localhost:3000' },
        backend: { baseUrl: 'http://localhost:7007' },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('GitLab')).toBeTruthy();
    });
    expect(screen.getByText('Sign in using GitLab')).toBeTruthy();

    // DefaultSignInPage's guestProvider renders an InfoCard titled literally
    // "Guest" (@backstage/core-components/dist/layout/SignInPage/
    // guestProvider.esm.js). Its absence proves this replaced the default
    // rather than rendering alongside it.
    //
    // Note this config sets no auth.environment, so the dev-only guest branch
    // below is off — which is exactly the production shape.
    expect(screen.queryByText('Guest')).toBeNull();
  });

  // Parity with the OFS shell: packages/app/src/components/SignInPage/
  // SignInPage.tsx offers ['guest', providerConfig] when auth.environment is
  // 'development' and [providerConfig] otherwise. Without this, a developer (and
  // the G1b bench) could not sign in at all without a real GitLab IdP.
  it('offers guest alongside GitLab when auth.environment is development', async () => {
    renderTestApp({
      features: [appSignInModule],
      initialRouteEntries: ['/'],
      config: {
        app: { title: 'Test App', baseUrl: 'http://localhost:3000' },
        backend: { baseUrl: 'http://localhost:7007' },
        auth: { environment: 'development' },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Guest')).toBeTruthy();
    });
    // Guest is additive, not a replacement: the real provider stays on the page.
    expect(screen.getByText('GitLab')).toBeTruthy();
  });
});
