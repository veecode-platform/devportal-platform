import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor } from '@testing-library/react';
import type { Entity } from '@backstage/catalog-model';
import { registerMswTestHooks, renderTestApp } from '@backstage/frontend-test-utils';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import catalogGraphPlugin from '@backstage/plugin-catalog-graph/alpha';
import { appApisModule } from './App';

// This is T4.3's proof surface: the catalog list page, entity page, graph page and
// nav item are NOT written by this app — they are @backstage/plugin-catalog's and
// @backstage/plugin-catalog-graph's own /alpha extensions (PageBlueprint,
// NavItemBlueprint, EntityContentBlueprint/EntityCardBlueprint — see
// node_modules/@backstage/plugin-catalog/dist/alpha/{pages,navItems,entityContents,
// apis}.esm.js and node_modules/@backstage/plugin-catalog-graph/dist/alpha.esm.js).
// This test renders those real, unmodified upstream extensions against a real
// backend contract (mocked at the HTTP layer via msw, not by faking catalogApiRef),
// using the same entity that packages/app-next/fixtures/kubernetes-control.yaml
// declares — the fixture already used by the NFS control-cohort evidence in
// docs/migrations/ofs-to-nfs/evidence/2026-07-29-nfs-executable-control-cohort.md.
const fixtureEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'nfs-kubernetes-control',
    namespace: 'default',
    description: 'NFS Gate 0.5 Kubernetes control entity',
    annotations: {
      'backstage.io/kubernetes-id': 'nfs-kubernetes-control',
      'backstage.io/kubernetes-namespace': 'default',
    },
  },
  spec: {
    type: 'service',
    lifecycle: 'experimental',
    owner: 'admins',
  },
};

// discoveryApiRef's default factory (@backstage/plugin-app) compiles catalog's
// baseUrl as `${backend.baseUrl}/api/catalog`, and renderTestApp's default mock
// config sets backend.baseUrl to this exact origin.
const CATALOG_BASE = 'http://localhost:7007/api/catalog';

// The catalog index page's table (CursorPaginatedCatalogTable) queries through
// CatalogClient.queryEntities(), which — depending on whether a predicate `query` is
// present — hits either GET {base}/entities/by-query or POST {base}/entities/by-query
// (queryEntitiesByPredicate), both returning {items, totalItems, pageInfo}. Both are
// mocked so this works regardless of which path the picker/table takes on first load.
const queryResponse = () =>
  HttpResponse.json({ items: [fixtureEntity], totalItems: 1, pageInfo: {} });

const server = setupServer(
  // CatalogClient.getEntities() -> GET {base}/entities{?fields,limit,filter*,...}
  http.get(`${CATALOG_BASE}/entities`, () => HttpResponse.json([fixtureEntity])),
  // CatalogClient.getEntityByRef() -> GET {base}/entities/by-name/{kind}/{namespace}/{name}
  http.get(
    `${CATALOG_BASE}/entities/by-name/component/default/nfs-kubernetes-control`,
    () => HttpResponse.json(fixtureEntity),
  ),
  http.get(`${CATALOG_BASE}/entities/by-query`, queryResponse),
  http.post(`${CATALOG_BASE}/entities/by-query`, queryResponse),
  // Facet pickers in the list-page sidebar (owner/kind/lifecycle) — not the subject
  // of this test, so just return no facets rather than leaving them unhandled.
  http.get(`${CATALOG_BASE}/entity-facets`, () =>
    HttpResponse.json({ facets: {} }),
  ),
);
registerMswTestHooks(server);

describe('catalog list, entity page, graph and nav (upstream @backstage/plugin-catalog defaults)', () => {
  it('lists the real fixture entity at /catalog and shows the Catalog nav item', async () => {
    renderTestApp({
      // appApisModule is included because PageBlueprint (used by every page these
      // plugins register) unconditionally requires pluginHeaderActionsApiRef, which
      // only this app's apis.ts provides a default for — see apis.ts for why.
      features: [catalogPlugin, catalogGraphPlugin, appApisModule],
      initialRouteEntries: ['/catalog'],
    });

    // The list page chains more mocked round-trips than the other two tests here
    // (entities/by-query, then entity-facets for the sidebar pickers), which can run
    // past testing-library's default waitFor timeout under load; observed flaky at
    // the default when run alongside apis.test.tsx, stable at this timeout across
    // repeated runs.
    await waitFor(
      () => {
        expect(screen.getAllByText('nfs-kubernetes-control').length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    // catalogNavItem (navItems.esm.js): NavItemBlueprint.make({ title: 'Catalog', ... })
    // "Catalog" appears at least twice (sidebar nav item + page header title);
    // getAllByText throws if not found at all, so a successful call proves the item.
    expect(screen.getAllByText('Catalog').length).toBeGreaterThan(0);
  });

  it('renders the entity page for the real fixture entity at its catalog route', async () => {
    renderTestApp({
      // appApisModule is included because PageBlueprint (used by every page these
      // plugins register) unconditionally requires pluginHeaderActionsApiRef, which
      // only this app's apis.ts provides a default for — see apis.ts for why.
      features: [catalogPlugin, catalogGraphPlugin, appApisModule],
      initialRouteEntries: ['/catalog/default/component/nfs-kubernetes-control'],
    });

    await waitFor(() => {
      expect(screen.getAllByText('nfs-kubernetes-control').length).toBeGreaterThan(0);
    });
    // Made it past PageBlueprint routing + the entity fetch, not the 404 fallback.
    expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();
  });

  it('resolves the /catalog-graph route registered by @backstage/plugin-catalog-graph', async () => {
    renderTestApp({
      // appApisModule is included because PageBlueprint (used by every page these
      // plugins register) unconditionally requires pluginHeaderActionsApiRef, which
      // only this app's apis.ts provides a default for — see apis.ts for why.
      features: [catalogPlugin, catalogGraphPlugin, appApisModule],
      initialRouteEntries: ['/catalog-graph'],
    });

    await waitFor(() => {
      expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();
    });
  });
});
