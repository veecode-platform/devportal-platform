/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { OAuth2, WebStorage } from '@backstage/core-app-api';
import {
  alertApiRef,
  analyticsApiRef,
  AnyApiFactory,
  bitbucketAuthApiRef,
  configApiRef,
  createApiFactory,
  createApiRef,
  discoveryApiRef,
  errorApiRef,
  fetchApiRef,
  githubAuthApiRef,
  gitlabAuthApiRef,
  identityApiRef,
  microsoftAuthApiRef,
  oauthRequestApiRef,
  storageApiRef,
} from '@backstage/core-plugin-api';
import {
  ScmAuth,
  scmAuthApiRef,
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
} from '@backstage/integration-react';
import { UserSettingsStorage } from '@backstage/plugin-user-settings';
import { visitsApiRef, VisitsStorageApi } from '@backstage/plugin-home';

// google analytics
import { GoogleAnalytics4 } from '@backstage-community/plugin-analytics-module-ga4';

import {
  oidcAuthApiRef,
  auth0AuthApiRef,
  samlAuthApiRef,
} from './api/AuthApiRefs';

// `toastApiRef` (id "core.toast") was added to Backstage's new frontend system and is
// pulled in by recent @backstage/core-components and several dynamic plugins (header,
// homepage, rbac, marketplace, …). The legacy frontend system this app uses (createApp
// from @backstage/app-defaults) registers no default factory for it — neither
// @backstage/app-defaults nor @backstage/core-app-api ships one — so `useApi(toastApiRef)`
// throws "No implementation available for apiRef{core.toast}" during the post-login render
// and blanks the app. The ApiFactoryRegistry resolves by id (not object identity), so a
// ref reconstructed with the same id satisfies the plugins' imported `toastApiRef` too;
// we bridge it to the alert API (which IS provided by app-defaults) so toasts surface as
// transient alerts in the existing <AlertDisplay />.
// TODO: remove once @backstage/app-defaults ships a default ToastApi factory for the
// legacy frontend system (or once we migrate to the new frontend system).
const toastApiRef = createApiRef<{
  post(toast: {
    message: string;
    severity?: 'success' | 'info' | 'warning' | 'error';
    display?: 'transient' | 'permanent';
  }): void;
  toast$(): unknown;
}>({ id: 'core.toast' });

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: toastApiRef,
    deps: { alertApi: alertApiRef },
    factory: ({ alertApi }) => ({
      post: (toast: any) =>
        alertApi.post({
          message: toast?.message ?? String(toast ?? ''),
          severity: toast?.severity ?? 'info',
          display: 'transient',
        }),
      toast$: () => alertApi.alert$() as unknown,
    }),
  }),
  createApiFactory({
    api: storageApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      errorApi: errorApiRef,
      fetchApi: fetchApiRef,
      identityApi: identityApiRef,
      configApi: configApiRef,
    },
    factory: deps => {
      const persistence =
        deps.configApi.getOptionalString('userSettings.persistence') ??
        'database';
      return persistence === 'browser'
        ? WebStorage.create(deps)
        : UserSettingsStorage.create(deps);
    },
  }),
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  createApiFactory({
    api: scmAuthApiRef,
    deps: {
      github: githubAuthApiRef,
      gitlab: gitlabAuthApiRef,
      azure: microsoftAuthApiRef,
      bitbucket: bitbucketAuthApiRef,
      configApi: configApiRef,
    },
    factory: ({ github, gitlab, azure, bitbucket, configApi }) => {
      const disableGitHubScmAuth =
        configApi.getOptionalBoolean('auth.disableScmAuth.forGitHub') ?? false;

      const providers = [
        ...(!disableGitHubScmAuth
          ? [{ key: 'github', ref: github, factory: ScmAuth.forGithub }]
          : []),
        { key: 'gitlab', ref: gitlab, factory: ScmAuth.forGitlab },
        { key: 'azure', ref: azure, factory: ScmAuth.forAzure },
        { key: 'bitbucket', ref: bitbucket, factory: ScmAuth.forBitbucket },
      ];

      const scmAuths = providers.flatMap(({ key, ref, factory }) => {
        const configs = configApi.getOptionalConfigArray(`integrations.${key}`);
        if (!configs?.length) {
          return [factory(ref)];
        }
        return configs.map(c => factory(ref, { host: c.getString('host') }));
      });

      return ScmAuth.merge(...scmAuths);
    },
  }),
  createApiFactory({
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
  // Auth0
  createApiFactory({
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
  // SAML
  createApiFactory({
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
  createApiFactory({
    api: analyticsApiRef,
    deps: { configApi: configApiRef, identityApi: identityApiRef },
    factory: ({ configApi, identityApi }) =>
      GoogleAnalytics4.fromConfig(configApi, {
        identityApi,
      }),
  }),
  createApiFactory({
    api: visitsApiRef,
    deps: { storageApi: storageApiRef, identityApi: identityApiRef },
    factory: ({ storageApi, identityApi }) =>
      VisitsStorageApi.create({ storageApi, identityApi }),
  }),
];
