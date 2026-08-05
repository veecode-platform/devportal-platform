import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { useTranslationRef } from '@backstage/frontend-plugin-api';
import {
  ProxiedSignInPage,
  SignInPage,
  type SignInProviderConfig,
} from '@backstage/core-components';
import {
  configApiRef,
  githubAuthApiRef,
  gitlabAuthApiRef,
  microsoftAuthApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { LdapAuthFrontendPage } from '@veecode-platform/backstage-plugin-ldap-auth';

import { oidcAuthApiRef } from './api/AuthApiRefs';
import { rhdhTranslationRef } from './translations/rhdh';

// T4.1: replaces @backstage/plugin-app's DefaultSignInPage, which hardcodes
// providers: ['guest'].
//
// This is a faithful port of packages/app/src/components/SignInPage/SignInPage.tsx,
// and the fidelity is the point. The first version of this file offered GitLab
// alone. That was a silent regression: five presets each set the `signInPage`
// config key — azure-auth:36 microsoft, github-auth:41 github, gitlab:42 gitlab,
// keycloak:38 keycloak, ldap:46 ldap — so four of the five would have rendered
// the wrong login screen with no error anywhere. The page mounts, it just offers
// a provider the deployment does not use.
//
// Worth recording why the first attempt undershot: the earlier scoping measured
// packages/app/src/components/VeeCodeSignInPage/** at ~1078 LOC and called the
// sign-in "the largest single item". That directory is dead code — commented out
// at both defaultAppComponents.tsx:24 (import) and :33 (usage). The file the app
// actually mounts is 151 LOC, and this port is a fraction of it.
const DEFAULT_PROVIDER = 'github';

/**
 * Key: provider name as it appears in the `signInPage` config key.
 * Value: a local provider config, or a string naming a proxy provider
 * (`ProxiedSignInPage`). The union is carried over from OFS — nothing configures
 * a proxy provider today, but the branch is what makes adding one config-only.
 */
// Generic over the translation function rather than typing it `(key: string) =>
// string`: useTranslationRef's `t` expects two or more arguments (the second
// carries interpolation params), so a one-argument parameter type is not
// assignable to it — tsc reports "Target signature provides too few arguments".
const createProviders = <T extends (...args: any[]) => string>(
  t: T,
): Map<string, SignInProviderConfig | string> =>
  new Map([
    [
      'github',
      {
        id: 'github-auth-provider',
        title: t('signIn.providers.github.title'),
        message: t('signIn.providers.github.message'),
        apiRef: githubAuthApiRef,
      },
    ],
    [
      'gitlab',
      {
        id: 'gitlab-auth-provider',
        title: t('signIn.providers.gitlab.title'),
        message: t('signIn.providers.gitlab.message'),
        apiRef: gitlabAuthApiRef,
      },
    ],
    [
      'microsoft',
      {
        id: 'microsoft-auth-provider',
        title: t('signIn.providers.microsoft.title'),
        message: t('signIn.providers.microsoft.message'),
        apiRef: microsoftAuthApiRef,
      },
    ],
    [
      // 'keycloak' in config, OIDC on the wire. oidcAuthApiRef is not a
      // Backstage core ref — it is defined in ./api/AuthApiRefs and registered
      // by apis.ts (T4.6), so this costs no new dependency.
      'keycloak',
      {
        id: 'oidc-auth-provider',
        title: t('signIn.providers.keycloak.title'),
        message: t('signIn.providers.keycloak.message'),
        apiRef: oidcAuthApiRef,
      },
    ],
  ]);

export const signInPage: ExtensionDefinition = SignInPageBlueprint.make({
  params: {
    loader: async () =>
      function NfsSignInPage(props) {
        const configApi = useApi(configApiRef);
        const { t } = useTranslationRef(rhdhTranslationRef);

        // Guest alongside the real provider when, and only when, the config says
        // this is a development environment — the same gate OFS uses. Production
        // sets auth.environment: production, so the shipped page never offers
        // guest. Without this, neither a developer nor the G1b bench can sign in
        // without a real IdP (that is T5.6a).
        const isDevEnv =
          configApi.getOptionalString('auth.environment') === 'development';
        const provider =
          configApi.getOptionalString('signInPage') ?? DEFAULT_PROVIDER;

        // LDAP is not an OAuth provider — it is a username/password form from a
        // separate package, so it replaces the whole page rather than becoming
        // one card on it.
        if (provider === 'ldap') {
          return (
            <LdapAuthFrontendPage {...props} provider="ldap">
              <div style={{ textAlign: 'center', marginTop: 40, marginBottom: 24 }}>
                <img
                  src={
                    configApi.getOptionalString('app.branding.fullLogo') ??
                    'https://platform.vee.codes/assets/pattern/logo.svg'
                  }
                  alt={configApi.getOptionalString('app.title') ?? 'DevPortal'}
                  style={{ maxWidth: 200 }}
                />
              </div>
            </LdapAuthFrontendPage>
          );
        }

        const providers = createProviders(t);
        const providerConfig =
          providers.get(provider) ?? providers.get(DEFAULT_PROVIDER)!;

        // A string value means "let the auth proxy decide" — no card, no button.
        if (typeof providerConfig !== 'object') {
          return <ProxiedSignInPage {...props} provider={providerConfig} />;
        }

        return (
          <SignInPage
            {...props}
            title={t('signIn.page.title')}
            align="center"
            providers={isDevEnv ? ['guest', providerConfig] : [providerConfig]}
          />
        );
      },
  },
});
