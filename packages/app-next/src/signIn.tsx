import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { SignInPage } from '@backstage/core-components';
import {
  configApiRef,
  gitlabAuthApiRef,
  useApi,
} from '@backstage/core-plugin-api';

// T4.1: replaces @backstage/plugin-app's DefaultSignInPage, which hardcodes
// providers: ['guest'] (node_modules/@backstage/frontend-defaults/node_modules/
// @backstage/plugin-app/dist/extensions/DefaultSignInPage.esm.js), with GitLab
// OAuth — the provider this app's users actually sign in with.
//
// gitlabAuthApiRef already has a default factory from @backstage/plugin-app
// (name: "gitlab-auth" in its dist/defaultApis.esm.js, one of 11 OAuth ApiRefs it
// wires up by default), so no ApiRef or factory needs registering here, only the
// page. Provider id/title/message ported verbatim from this repo's OFS
// equivalent (packages/app/src/components/SignInPage/SignInPage.tsx's 'gitlab'
// entry) so the copy matches what's already shipped.
const gitlabProvider = {
  id: 'gitlab-auth-provider',
  title: 'GitLab',
  message: 'Sign in using GitLab',
  apiRef: gitlabAuthApiRef,
};

export const signInPage: ExtensionDefinition = SignInPageBlueprint.make({
  params: {
    loader: async () =>
      function NfsSignInPage(props) {
        // Guest alongside the real provider when, and only when, the config says
        // this is a development environment. This is not a bench affordance
        // bolted on for the smoke: it is what the OFS shell already does —
        // packages/app/src/components/SignInPage/SignInPage.tsx reads
        // auth.environment and builds ['guest', providerConfig] when it equals
        // 'development', otherwise [providerConfig]. Dropping that on the NFS
        // side would have been a silent parity regression, and it is also what
        // lets G1b reach an authenticated surface without a real GitLab IdP
        // (that is T5.6a). Production sets auth.environment: production, so the
        // shipped behaviour is GitLab alone.
        const configApi = useApi(configApiRef);
        const isDevEnv =
          configApi.getOptionalString('auth.environment') === 'development';

        return (
          <SignInPage
            {...props}
            providers={isDevEnv ? ['guest', gitlabProvider] : [gitlabProvider]}
          />
        );
      },
  },
});
