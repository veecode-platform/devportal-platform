import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor } from '@testing-library/react';
import type { Entity } from '@backstage/catalog-model';
import { registerMswTestHooks, renderTestApp, createExtensionTester } from '@backstage/frontend-test-utils';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import techdocsPlugin from '@backstage/plugin-techdocs/alpha';
import { AddonBlueprint } from '@backstage/plugin-techdocs-react/alpha';
import { techDocsMermaidAddon } from 'backstage-plugin-techdocs-addon-mermaid/alpha';
import { appApisModule } from './App';

// This is T4.5's proof surface: the TechDocs entity-page tab, the standalone
// /docs route and the Mermaid addon are NOT written by this app — they are
// @backstage/plugin-techdocs's own /alpha extensions (PageBlueprint for the
// reader/index pages, EntityContentBlueprint for the entity tab — see
// node_modules/@backstage/plugin-techdocs/dist/alpha.esm.js:129-173, where
// techDocsEntityContent is EntityContentBlueprint.makeWithOverrides({ path:
// "docs", title: "TechDocs", group: "documentation", ... })) plus the
// standalone mermaid package's own /alpha module.
//
// The premise this test settles: does the Mermaid addon really need
// AddonBlueprint under NFS, or does it bypass it as a static dependency?
// node_modules/backstage-plugin-techdocs-addon-mermaid/dist/alpha.esm.js
// shows it does NOT bypass anything — it calls
// `AddonBlueprint.make({ name: "mermaid", params: { name: "Mermaid",
// location: "Content", component: MermaidAddon } })` and wraps that single
// extension in `createFrontendModule({ pluginId: "techdocs", extensions:
// [...] })`, exactly the same FrontendModule-attaches-to-a-plugin shape as
// every other dynamic extension in this codebase. Both
// techDocsEntityContent and the reader PageBlueprint declare
// `inputs: { addons: createExtensionInput([AddonBlueprint.dataRefs.addon]) }`,
// so a Mermaid module included as a feature is picked up automatically —
// no bespoke JSX wiring like the old app's
// `<TechDocsAddons><Mermaid /></TechDocsAddons>` (packages/app/src/components/AppBase/AppBase.tsx:233-235)
// is required.
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

const CATALOG_BASE = 'http://localhost:7007/api/catalog';

const queryResponse = () =>
  HttpResponse.json({ items: [fixtureEntity], totalItems: 1, pageInfo: {} });

const server = setupServer(
  http.get(`${CATALOG_BASE}/entities`, () => HttpResponse.json([fixtureEntity])),
  http.get(
    `${CATALOG_BASE}/entities/by-name/component/default/nfs-kubernetes-control`,
    () => HttpResponse.json(fixtureEntity),
  ),
  http.get(`${CATALOG_BASE}/entities/by-query`, queryResponse),
  http.post(`${CATALOG_BASE}/entities/by-query`, queryResponse),
  http.get(`${CATALOG_BASE}/entity-facets`, () => HttpResponse.json({ facets: {} })),
);
registerMswTestHooks(server);

describe('techdocs entity tab and /docs route (upstream @backstage/plugin-techdocs defaults)', () => {
  it('shows the TechDocs tab (EntityContentBlueprint) on the real fixture entity page', async () => {
    renderTestApp({
      // appApisModule is included because PageBlueprint (used by every page these
      // plugins register) unconditionally requires pluginHeaderActionsApiRef,
      // which only this app's apis.ts provides a default for — see catalog.test.tsx.
      features: [catalogPlugin, techdocsPlugin, appApisModule],
      initialRouteEntries: ['/catalog/default/component/nfs-kubernetes-control'],
    });

    await waitFor(() => {
      expect(screen.getAllByText('nfs-kubernetes-control').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();
    // techDocsEntityContent's registered title (alpha.esm.js:145) — proves the
    // tab is a real, attached extension, not just the standalone /docs route.
    await waitFor(() => {
      expect(screen.getAllByText('TechDocs').length).toBeGreaterThan(0);
    });
  });

  it('resolves the standalone /docs route registered by @backstage/plugin-techdocs', async () => {
    renderTestApp({
      features: [techdocsPlugin, appApisModule],
      initialRouteEntries: ['/docs'],
    });

    await waitFor(() => {
      expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();
    });
  });

  it('registers the Mermaid TechDocs addon as a real AddonBlueprint extension (not a static bypass)', () => {
    const tester = createExtensionTester(techDocsMermaidAddon);
    const options = tester.get(AddonBlueprint.dataRefs.addon);

    expect(options.name).toBe('Mermaid');
    expect(options.location).toBe('Content');
    expect(options.component).toBeDefined();
  });
});
