import { Suspense } from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  createExtensionTester,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import type { ComponentType } from 'react';
import type { SignInPageProps } from '@backstage/plugin-app-react';
import {
  githubAuthApiRef,
  gitlabAuthApiRef,
  microsoftAuthApiRef,
} from '@backstage/core-plugin-api';

import { oidcAuthApiRef } from './api/AuthApiRefs';
import { signInPage } from './signIn';

// These tests used to drive the whole app through renderTestApp. They cannot any
// more, and the reason is worth recording because it says something about the
// shell, not about the test:
//
// frontend-test-utils 0.6.2 moved sign-in into a BOOTSTRAP app phase that runs
// before the finalized app exists — prepareSpecializedApp.esm.js, where
// `signInRuntime.requiresSignIn` makes finalize() throw "requires waiting for the
// bootstrap app to be ready". renderTestApp only walks the synchronous finalize
// path and, by design, disables `sign-in-page:app` outright so ordinary page
// tests can skip the login wall. So an app WITH a sign-in page is not renderable
// through that helper at all. Passing a mock identity api does not help either —
// measured, same error: the identity has to come from the bootstrap phase.
//
// The extension-level harness below keeps every assertion that mattered: the
// component comes out of the real extension the app registers, so the provider
// matrix is exercised against the shipped code path. What it no longer asserts is
// that this module replaces plugin-app's DefaultSignInPage at the same extension
// id — that claim now lives where it was always strongest, in the browser proof
// against a built image (two benches from one image: signInPage gitlab renders the
// GitLab card, microsoft renders Azure, each with the other three absent).
//
// What all of this guards: the first version of signIn.tsx offered GitLab
// unconditionally and never read the `signInPage` config key. Five presets set
// that key, so four of them silently got the wrong login screen. A test that only
// asserted "GitLab renders" passed happily through that bug — so every case below
// pins a different provider and asserts the others are absent.
const baseConfig = {
  // MultiSignInPage (core-components) unconditionally calls
  // configApi.getString('app.title').
  app: { title: 'Test App', baseUrl: 'http://localhost:3000' },
  backend: { baseUrl: 'http://localhost:7007' },
};

// Rendering a provider card reads title/message off the config object and puts
// the apiRef behind the button, so an empty stub renders fine. Every ref the
// five-provider map can reach is listed: oidcAuthApiRef in particular is not a
// Backstage core ref — apis.ts registers it (T4.6) — and without it the keycloak
// row renders a warning panel instead of a card.
const authStubs: [any, any][] = [
  [githubAuthApiRef, {}],
  [gitlabAuthApiRef, {}],
  [microsoftAuthApiRef, {}],
  [oidcAuthApiRef, {}],
];

const renderWith = (config: Record<string, unknown>) => {
  // The component is pulled out of the REAL extension the app registers, then
  // rendered inside a test app. renderInTestApp is what supplies everything
  // core-components' SignInPage needs and this file must not fake: a router
  // (it calls useLocation), a MUI theme (theme.spacing), and the app's own
  // translation api, so the provider titles come out as the shipped English
  // wording rather than as raw keys. Measured, in this order, by probing the
  // rendered text: without a router it renders "useLocation() may be used only
  // in the context of a <Router>", without a theme "theme.spacing is not a
  // function". Both were silent — the page mounted and simply said nothing.
  // The cast restates the ref's own declared type — the blueprint's output is
  // ExtensionDataRef<ComponentType<SignInPageProps>, 'core.sign-in-page.component'>.
  // `signInPage` is typed as the wide ExtensionDefinition so App.tsx can hold it in
  // a module, which loses the output type on the way through .get().
  const SignInComponent = createExtensionTester(signInPage).get(
    SignInPageBlueprint.dataRefs.component,
  ) as ComponentType<SignInPageProps>;

  return renderInTestApp(
    <Suspense fallback={null}>
      <SignInComponent onSignInSuccess={() => {}} />
    </Suspense>,
    {
      config: { ...baseConfig, ...config },
      apis: authStubs,
    },
  );
};

describe('the sign-in page honours the signInPage config key', () => {
  // Each row is a preset that exists today: presets/github-auth.yaml:41,
  // presets/gitlab.yaml:42, presets/azure-auth.yaml:36, presets/keycloak.yaml:38.
  // `expected` is the provider card title as the rhdh translation ref defines it
  // — note microsoft's title is "Azure", not "Microsoft".
  it.each([
    ['github', 'GitHub'],
    ['gitlab', 'GitLab'],
    ['microsoft', 'Azure'],
    ['keycloak', 'Keycloak'],
  ])(
    'renders the %s provider when signInPage is %s',
    async (provider, expectedTitle) => {
      renderWith({ signInPage: provider });

      await waitFor(() => {
        expect(screen.getByText(expectedTitle)).toBeTruthy();
      });

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

    // No provider card at all — that absence is the assertion. A card here would
    // mean the ldap branch was not taken.
    await waitFor(() => {
      expect(screen.queryByText('GitHub')).toBeNull();
    });
    for (const provider of ['GitHub', 'GitLab', 'Azure', 'Keycloak']) {
      expect(screen.queryByText(provider)).toBeNull();
    }
  });
});

describe('the sign-in page gates guest on auth.environment', () => {
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
