import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { registerMswTestHooks, renderTestApp } from '@backstage/frontend-test-utils';
import authPlugin from '@backstage/plugin-auth';
import { appApisModule } from './App';

// T4.2 discriminating test result: @backstage/plugin-auth (v0.1.10, the exact
// version shipped in the backstage/backstage v1.53.0 tag this repo is pinned to)
// registers a PageBlueprint at path '/oauth2' whose nested Router
// (dist/components/Router.esm.js) mounts a ConsentPage at '/authorize/:sessionId'
// — i.e. the exact route /oauth2/authorize/:sessionId that this app's OFS
// ConsentPage.tsx (packages/app/src/components/Auth/ConsentPage.tsx) is mounted
// at. Its useConsentSession hook (dist/components/ConsentPage/
// useConsentSession.esm.js) fetches GET {authBaseUrl}/v1/sessions/:id and POSTs
// {authBaseUrl}/v1/sessions/:id/approve|reject, then redirects via the response's
// redirectUrl — the identical backend contract our OFS page hand-rolls. This is
// not "100% VeeCode custom": the backend contract is a real upstream Backstage
// feature and upstream ships a matching frontend page for free, so per plan this
// registers the dependency directly instead of porting ConsentPage.tsx.
const SESSION_ID = 'test-session-id';
const AUTH_BASE = 'http://localhost:7007/api/auth';

const sessionFixture = {
  id: SESSION_ID,
  clientName: 'Test OAuth Client',
  clientId: 'https://client.example.com/metadata.json',
  redirectUri: 'https://client.example.com/callback',
  scope: 'catalog.read',
};

const approveRequests: string[] = [];
const rejectRequests: string[] = [];

const server = setupServer(
  // useConsentSession's sessionState -> GET {authBaseUrl}/v1/sessions/:id
  http.get(`${AUTH_BASE}/v1/sessions/${SESSION_ID}`, () =>
    HttpResponse.json(sessionFixture),
  ),
  // useConsentSession's handleAction('approve') -> POST .../approve
  http.post(`${AUTH_BASE}/v1/sessions/${SESSION_ID}/approve`, () => {
    approveRequests.push(SESSION_ID);
    return HttpResponse.json({
      redirectUrl: `${sessionFixture.redirectUri}?code=abc`,
    });
  }),
  // useConsentSession's handleAction('reject') -> POST .../reject
  http.post(`${AUTH_BASE}/v1/sessions/${SESSION_ID}/reject`, () => {
    rejectRequests.push(SESSION_ID);
    return HttpResponse.json({
      redirectUrl: `${sessionFixture.redirectUri}?error=access_denied`,
    });
  }),
);
registerMswTestHooks(server);

beforeEach(() => {
  approveRequests.length = 0;
  rejectRequests.length = 0;
});

describe('@backstage/plugin-auth ConsentPage (T4.2, registered for free)', () => {
  it('renders the real upstream consent page at /oauth2/authorize/:sessionId with the mocked session', async () => {
    renderTestApp({
      // appApisModule is included because PageBlueprint (used by AuthPage, same
      // as every page these plugins register) unconditionally requires
      // pluginHeaderActionsApiRef, which only this app's apis.ts provides a
      // default for — see apis.ts and catalog.test.tsx for the same reasoning.
      features: [authPlugin, appApisModule],
      initialRouteEntries: [`/oauth2/authorize/${SESSION_ID}`],
    });

    await waitFor(() => {
      expect(screen.getByText(sessionFixture.clientName)).toBeTruthy();
    });
    expect(screen.getByText(sessionFixture.redirectUri)).toBeTruthy();
    expect(screen.getByText(sessionFixture.scope)).toBeTruthy();
  });

  it('POSTs to the approve endpoint and does not touch reject when the user authorizes', async () => {
    renderTestApp({
      features: [authPlugin, appApisModule],
      initialRouteEntries: [`/oauth2/authorize/${SESSION_ID}`],
    });

    await waitFor(() => {
      expect(screen.getByText(sessionFixture.clientName)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Authorize'));

    await waitFor(() => {
      expect(approveRequests).toEqual([SESSION_ID]);
    });
    expect(rejectRequests).toEqual([]);
  });

  it('POSTs to the reject endpoint and does not touch approve when the user cancels', async () => {
    renderTestApp({
      features: [authPlugin, appApisModule],
      initialRouteEntries: [`/oauth2/authorize/${SESSION_ID}`],
    });

    await waitFor(() => {
      expect(screen.getByText(sessionFixture.clientName)).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(rejectRequests).toEqual([SESSION_ID]);
    });
    expect(approveRequests).toEqual([]);
  });
});
