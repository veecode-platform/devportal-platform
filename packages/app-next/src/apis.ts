import {
  ApiBlueprint,
  alertApiRef,
  configApiRef,
  discoveryApiRef,
  identityApiRef,
  oauthRequestApiRef,
  storageApiRef,
  toastApiRef,
} from '@backstage/frontend-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import { visitsApiRef, VisitsStorageApi } from '@backstage/plugin-home';
import { auth0AuthApiRef, oidcAuthApiRef, samlAuthApiRef } from './api/AuthApiRefs';

// scmIntegrationsApiRef, scmAuthApiRef and storageApiRef are NOT registered here.
// @backstage/plugin-app (unconditionally included by createApp()/renderInTestApp())
// already provides default factories for all three ("scm-integrations", "scm-auth"
// and "storage" in its defaultApis) — verified by reading
// node_modules/@backstage/plugin-app/dist/defaultApis.esm.js. Re-registering them
// here would just duplicate an existing provider. See apis.test.ts for proof that
// they resolve.

// toastApiRef (id "core.toast") is defined by @backstage/frontend-plugin-api, but no
// installed package (searched all of node_modules/@backstage/*) ships a default
// factory for it as of this Backstage release. Several dynamic plugins call
// useApi(toastApiRef) directly (same issue the OFS bridge in packages/app/src/apis.ts
// documents for the legacy frontend system), so without a factory the app would blank
// on render. Bridge it onto alertApiRef, which IS provided by default and rendered by
// the default alertDisplayAppRootElement, so posted toasts surface as alerts.
export const toastApi = ApiBlueprint.make({
  name: 'toast',
  params: defineParams =>
    defineParams({
      api: toastApiRef,
      deps: { alertApi: alertApiRef },
      factory: ({ alertApi }) => ({
        post: toast => {
          const severity =
            toast.status === 'danger'
              ? ('error' as const)
              : toast.status === 'neutral'
              ? ('info' as const)
              : toast.status ?? ('success' as const);
          const message = toast.description
            ? `${toast.title} — ${toast.description}`
            : String(toast.title);
          alertApi.post({ message, severity, display: 'transient' });
          // AlertApi has no per-alert handle; alerts auto-dismiss on their own.
          return { close: () => {} };
        },
      }),
    }),
});

// visitsApiRef backs the "recently visited"/"top visited" home-page widgets.
// @backstage/plugin-home's own /alpha entrypoint does register a default factory for
// it, but pulling in the whole home plugin as a feature would also register its
// home-page route/nav item, which is outside this task. Register just the API here,
// reusing the same upstream VisitsStorageApi implementation and dependency shape as
// the OFS apis.ts factory.
export const visitsApi = ApiBlueprint.make({
  name: 'visits',
  params: defineParams =>
    defineParams({
      api: visitsApiRef,
      deps: { storageApi: storageApiRef, identityApi: identityApiRef },
      factory: ({ storageApi, identityApi }) =>
        VisitsStorageApi.create({ storageApi, identityApi }),
    }),
});

// Ported from packages/app/src/apis.ts. Backstage ships no oidcAuthApiRef /
// auth0AuthApiRef / samlAuthApiRef core refs; VeeCode defines them locally
// (./api/AuthApiRefs) and backs them with the generic OAuth2 client from
// @backstage/core-app-api, same as OFS. discoveryApi/oauthRequestApi/configApi are
// all provided by default via @backstage/plugin-app, so no extra wiring is needed for
// these three dependencies to resolve.
export const oidcAuthApi = ApiBlueprint.make({
  name: 'oidc-auth',
  params: defineParams =>
    defineParams({
      api: oidcAuthApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
        OAuth2.create({
          configApi,
          discoveryApi,
          oauthRequestApi: oauthRequestApi as any,
          provider: {
            id: 'oidc',
            title: 'OIDC',
            icon: () => null,
          },
          environment: configApi.getOptionalString('auth.environment'),
        }),
    }),
});

export const auth0AuthApi = ApiBlueprint.make({
  name: 'auth0-auth',
  params: defineParams =>
    defineParams({
      api: auth0AuthApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
        OAuth2.create({
          discoveryApi,
          oauthRequestApi: oauthRequestApi as any,
          provider: {
            id: 'auth0',
            title: 'Auth0',
            icon: () => null,
          },
          defaultScopes: ['openid', 'email', 'profile'],
          environment: configApi.getOptionalString('auth.environment'),
        }),
    }),
});

export const samlAuthApi = ApiBlueprint.make({
  name: 'saml-auth',
  params: defineParams =>
    defineParams({
      api: samlAuthApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
        configApi: configApiRef,
      },
      factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
        OAuth2.create({
          discoveryApi,
          oauthRequestApi: oauthRequestApi as any,
          provider: {
            id: 'saml',
            title: 'SAML',
            icon: () => null,
          },
          environment: configApi.getOptionalString('auth.environment'),
        }),
    }),
});

export const apis = [
  toastApi,
  visitsApi,
  oidcAuthApi,
  auth0AuthApi,
  samlAuthApi,
];
