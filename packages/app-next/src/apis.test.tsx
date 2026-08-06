import { createExtensionTester, renderInTestApp } from '@backstage/frontend-test-utils';
import {
  ApiBlueprint,
  pluginHeaderActionsApiRef,
  storageApiRef,
  toastApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { scmAuthApiRef, scmIntegrationsApiRef } from '@backstage/integration-react';
import { visitsApiRef } from '@backstage/plugin-home';
import { appApisModule } from './App';
import { toastApi } from './apis';
import { auth0AuthApiRef, oidcAuthApiRef, samlAuthApiRef } from './api/AuthApiRefs';

// Renders a real app tree (the same appApisModule wired into App.tsx, plus whatever
// @backstage/plugin-app provides by default) and resolves every mandatory API through
// useApi — the same hook plugins call. If any of these were unresolvable, useApi would
// throw "No implementation available for apiRef{...}" during render and the render
// call itself would fail, which is what makes this a resolution proof rather than a
// "the file mentions it" check.
function ApiProbe() {
  // Free by default via @backstage/plugin-app (not registered by this app):
  const scmIntegrations = useApi(scmIntegrationsApiRef);
  const scmAuth = useApi(scmAuthApiRef);
  const storage = useApi(storageApiRef);
  // Registered by this app's apis.ts / appApisModule:
  const visits = useApi(visitsApiRef);
  const toast = useApi(toastApiRef);
  // Not one of T4.6's named refs, but a hard blocker for T4.3 — see apis.ts.
  const pluginHeaderActions = useApi(pluginHeaderActionsApiRef);
  const oidcAuth = useApi(oidcAuthApiRef);
  const auth0Auth = useApi(auth0AuthApiRef);
  const samlAuth = useApi(samlAuthApiRef);

  const checks = {
    scmIntegrations: typeof scmIntegrations.resolveUrl === 'function',
    scmAuth: typeof scmAuth.getCredentials === 'function',
    storage: typeof storage.forBucket === 'function',
    visits: typeof visits.save === 'function' && typeof visits.list === 'function',
    toast: typeof toast.post === 'function',
    pluginHeaderActions:
      Array.isArray(pluginHeaderActions.getPluginHeaderActions('app')),
    oidcAuth:
      typeof oidcAuth.getAccessToken === 'function' &&
      typeof oidcAuth.getBackstageIdentity === 'function',
    auth0Auth:
      typeof auth0Auth.getAccessToken === 'function' &&
      typeof auth0Auth.getBackstageIdentity === 'function',
    samlAuth:
      typeof samlAuth.getAccessToken === 'function' &&
      typeof samlAuth.getBackstageIdentity === 'function',
  };

  return <pre data-testid="api-probe">{JSON.stringify(checks)}</pre>;
}

describe('app-next mandatory APIs resolve', () => {
  it('resolves all 5 mandatory APIs plus the 3 optional auth providers through useApi', () => {
    const { getByTestId } = renderInTestApp(<ApiProbe />, {
      features: [appApisModule],
    });

    const checks = JSON.parse(getByTestId('api-probe').textContent!);
    expect(checks).toEqual({
      scmIntegrations: true,
      scmAuth: true,
      storage: true,
      visits: true,
      toast: true,
      pluginHeaderActions: true,
      oidcAuth: true,
      auth0Auth: true,
      samlAuth: true,
    });
  });
});

describe('toastApi bridges to alertApiRef (@backstage/plugin-app default)', () => {
  it('maps title/description/status onto an alert message and posts it', () => {
    const posted: unknown[] = [];
    const mockAlertApi = { post: (a: unknown) => posted.push(a), alert$: () => ({}) as any };

    const factory = createExtensionTester(toastApi).get(ApiBlueprint.dataRefs.factory);
    const impl = factory.factory({ alertApi: mockAlertApi } as any) as {
      post: (t: any) => { close: () => void };
    };

    const handle = impl.post({
      title: 'Entity saved',
      description: 'Your changes have been saved successfully.',
      status: 'danger',
    });

    expect(posted).toEqual([
      {
        message: 'Entity saved — Your changes have been saved successfully.',
        severity: 'error',
        display: 'transient',
      },
    ]);
    expect(typeof handle.close).toBe('function');
  });
});
