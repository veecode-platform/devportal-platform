import { screen, waitFor } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { appApisModule, appSignInModule } from './App';

// renderTestApp disables the 'sign-in-page:app' extension by default
// (node_modules/@backstage/frontend-test-utils/dist/app/renderTestApp.esm.js)
// so ordinary page/route tests can skip the sign-in wall. Passing appSignInModule
// as a feature re-enables that same extension id with this app's own content:
// resolveAppNodeSpecs (node_modules/@backstage/frontend-defaults/node_modules/
// @backstage/frontend-app-api/dist/tree/resolveAppNodeSpecs.esm.js) lets a later
// module extension of the same id replace both the disabled flag and the content
// of an earlier plugin-level override, rather than erroring as a duplicate. That
// means these tests exercise the real, unmodified sign-in gate
// (@backstage/plugin-app's extensions/AppRoot.esm.js: no SignInPageComponent ->
// auto-guest and skip straight to children; a SignInPageComponent -> render it
// and withhold children until onSignInSuccess fires) against this app's page.
//
// What these tests are really guarding: the first version of signIn.tsx offered
// GitLab unconditionally and never read the `signInPage` config key. Five presets
// set that key, so four of them silently got the wrong login screen. A test that
// only asserted "GitLab renders" passed happily through that bug — so every case
// below pins a *different* provider and asserts the others are absent.
const baseConfig = {
  // MultiSignInPage (core-components) unconditionally calls
  // configApi.getString('app.title'), which throws on the default mock config
  // (it only sets app.baseUrl/backend.baseUrl).
  app: { title: 'Test App', baseUrl: 'http://localhost:3000' },
  backend: { baseUrl: 'http://localhost:7007' },
};

const renderWith = (config: Record<string, unknown>) =>
  renderTestApp({
    // appApisModule is required, not decorative: the keycloak provider resolves
    // oidcAuthApiRef, which is not a Backstage core ref — apis.ts registers it
    // (T4.6). Without this module that row throws
    // "No implementation available for apiRef{internal.auth.oidc}" and renders a
    // BackstageWarningPanel instead of the provider card. The shipped app passes
    // both modules in createApp's features[], so this only aligns the harness
    // with production.
    features: [appApisModule, appSignInModule],
    initialRouteEntries: ['/'],
    config: { ...baseConfig, ...config },
  });

describe('appSignInModule honours the signInPage config key', () => {
  // Each row is a preset that exists today: presets/github-auth.yaml:41,
  // presets/gitlab.yaml:42, presets/azure-auth.yaml:36, presets/keycloak.yaml:38.
  // `expected` is the provider card title as the rhdh translation ref defines it
  // — note microsoft's title is "Azure", not "Microsoft".
  it.each([
    ['github', 'GitHub', 'Sign in using GitHub'],
    ['gitlab', 'GitLab', 'Sign in using GitLab'],
    ['microsoft', 'Azure', 'Sign in using Azure'],
    ['keycloak', 'Keycloak', 'Sign in using Keycloak'],
  ])(
    'renders the %s provider when signInPage is %s',
    async (provider, expectedTitle, expectedMessage) => {
      renderWith({ signInPage: provider });

      await waitFor(() => {
        expect(screen.getByText(expectedTitle)).toBeTruthy();
      });
      expect(screen.getByText(expectedMessage)).toBeTruthy();

      // The discriminating half: no OTHER provider leaked onto the page. Without
      // this, a page that rendered all four would pass every row above.
      for (const other of ['GitHub', 'GitLab', 'Azure', 'Keycloak']) {
        if (other !== expectedTitle) {
          expect(screen.queryByText(other)).toBeNull();
        }
      }
    },
  );

  it('falls back to github when signInPage is absent', async () => {
    renderWith({});

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeTruthy();
    });
    expect(screen.queryByText('GitLab')).toBeNull();
  });

  it('falls back to github when signInPage names an unknown provider', async () => {
    renderWith({ signInPage: 'not-a-real-provider' });

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeTruthy();
    });
  });

  it('renders the LDAP username/password form instead of provider cards', async () => {
    // LDAP is not an OAuth provider: it is a form from
    // @veecode-platform/backstage-plugin-ldap-auth, so it replaces the whole page
    // rather than becoming one card on it. presets/ldap.yaml:46 selects it.
    renderWith({ signInPage: 'ldap' });

    await waitFor(() => {
      expect(screen.queryByText('GitHub')).toBeNull();
    });
    // No provider card at all — that absence is the assertion. A card here would
    // mean the ldap branch was not taken.
    for (const provider of ['GitHub', 'GitLab', 'Azure', 'Keycloak']) {
      expect(screen.queryByText(provider)).toBeNull();
    }
  });
});

describe('appSignInModule gates guest on auth.environment', () => {
  it('does not offer guest without auth.environment (the production shape)', async () => {
    renderWith({ signInPage: 'gitlab' });

    await waitFor(() => {
      expect(screen.getByText('GitLab')).toBeTruthy();
    });
    // DefaultSignInPage's guestProvider renders an InfoCard titled literally
    // "Guest" (@backstage/core-components/dist/layout/SignInPage/
    // guestProvider.esm.js). Its absence is what proves the gate.
    expect(screen.queryByText('Guest')).toBeNull();
  });

  it('offers guest alongside the real provider in development', async () => {
    renderWith({ signInPage: 'gitlab', auth: { environment: 'development' } });

    await waitFor(() => {
      expect(screen.getByText('Guest')).toBeTruthy();
    });
    // Guest is additive, not a replacement.
    expect(screen.getByText('GitLab')).toBeTruthy();
  });

  it('offers guest alongside github too, not only gitlab', async () => {
    renderWith({ signInPage: 'github', auth: { environment: 'development' } });

    await waitFor(() => {
      expect(screen.getByText('Guest')).toBeTruthy();
    });
    expect(screen.getByText('GitHub')).toBeTruthy();
  });
});
