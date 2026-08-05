import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { SignInPage } from '@backstage/core-components';
import { gitlabAuthApiRef } from '@backstage/core-plugin-api';

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
export const signInPage: ExtensionDefinition = SignInPageBlueprint.make({
  params: {
    loader: async () =>
      props => (
        <SignInPage
          {...props}
          providers={[
            {
              id: 'gitlab-auth-provider',
              title: 'GitLab',
              message: 'Sign in using GitLab',
              apiRef: gitlabAuthApiRef,
            },
          ]}
        />
      ),
  },
});
