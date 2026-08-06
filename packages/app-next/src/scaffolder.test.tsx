import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor } from '@testing-library/react';
import type { Entity } from '@backstage/catalog-model';
import { registerMswTestHooks, renderTestApp } from '@backstage/frontend-test-utils';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { appApisModule } from './App';

// This is T4.4's proof surface: the /create page, the Templates sub-page and
// the stock field pickers are NOT written by this app — they are
// @backstage/plugin-scaffolder's own /alpha extensions (PageBlueprint,
// SubPageBlueprint, FormFieldBlueprint — see
// node_modules/@backstage/plugin-scaffolder/dist/alpha/extensions.esm.js).
// That file registers exactly 10 FormFieldBlueprint pickers: repo-url-picker,
// entity-name-picker, entity-picker, owner-picker, entity-tags-picker,
// multi-entity-picker, my-groups-picker, owned-entity-picker,
// repo-branch-picker and repo-owner-picker. RepoOwnerPicker's GitLab variant
// (dist/components/fields/RepoOwnerPicker/GitLabRepoOwnerPicker.esm.js) is an
// internal implementation detail the repo-owner-picker component switches on
// (see dist/components/fields/RepoOwnerPicker/RepoOwnerPicker.esm.js:9,78),
// not a separately registered blueprint.
//
// This test renders that real, unmodified upstream plugin against a real
// backend contract (mocked at the HTTP layer via msw, not by faking
// scaffolderApiRef/catalogApiRef), using a Template entity whose parameters
// schema exercises all 10 stock ui:field names in a single step.
const fixtureTemplate: Entity = {
  apiVersion: 'scaffolder.backstage.io/v1beta3',
  kind: 'Template',
  metadata: {
    name: 'nfs-stock-pickers-template',
    namespace: 'default',
    description: 'T4.4 proof template exercising every stock scaffolder field picker',
  },
  spec: {
    type: 'service',
    owner: 'admins',
    parameters: {
      title: 'Stock pickers',
      properties: {
        repoUrlField: { title: 'Repo URL Field', type: 'string', 'ui:field': 'RepoUrlPicker' },
        entityNameField: { title: 'Entity Name Field', type: 'string', 'ui:field': 'EntityNamePicker' },
        entityField: { title: 'Entity Field', type: 'string', 'ui:field': 'EntityPicker' },
        ownerField: { title: 'Owner Field', type: 'string', 'ui:field': 'OwnerPicker' },
        entityTagsField: { title: 'Entity Tags Field', type: 'array', 'ui:field': 'EntityTagsPicker' },
        multiEntityField: { title: 'Multi Entity Field', type: 'array', 'ui:field': 'MultiEntityPicker' },
        myGroupsField: { title: 'My Groups Field', type: 'string', 'ui:field': 'MyGroupsPicker' },
        ownedEntityField: { title: 'Owned Entity Field', type: 'string', 'ui:field': 'OwnedEntityPicker' },
        repoBranchField: { title: 'Repo Branch Field', type: 'string', 'ui:field': 'RepoBranchPicker' },
        repoOwnerField: { title: 'Repo Owner Field', type: 'string', 'ui:field': 'RepoOwnerPicker' },
      },
    },
    steps: [{ id: 'noop', name: 'Noop', action: 'debug:log' }],
  },
};

// discoveryApiRef's default factory compiles scaffolder's baseUrl as
// `${backend.baseUrl}/api/scaffolder` — see
// node_modules/@backstage/plugin-scaffolder-common/dist/schema/openapi/generated/apis/Api.client.esm.js
// for the exact `/v2/templates/{namespace}/{kind}/{name}/parameter-schema`
// path the wizard's useTemplateParameterSchema() hook hits.
const SCAFFOLDER_BASE = 'http://localhost:7007/api/scaffolder';
const CATALOG_BASE = 'http://localhost:7007/api/catalog';

const queryResponse = () =>
  HttpResponse.json({ items: [fixtureTemplate], totalItems: 1, pageInfo: {} });

const server = setupServer(
  http.get(`${CATALOG_BASE}/entities/by-query`, queryResponse),
  http.post(`${CATALOG_BASE}/entities/by-query`, queryResponse),
  http.get(`${CATALOG_BASE}/entities`, () => HttpResponse.json([fixtureTemplate])),
  http.get(
    `${CATALOG_BASE}/entities/by-name/template/default/nfs-stock-pickers-template`,
    () => HttpResponse.json(fixtureTemplate),
  ),
  http.get(`${CATALOG_BASE}/entity-facets`, () => HttpResponse.json({ facets: {} })),
  // The wizard fetches the already-parsed parameter manifest from scaffolder
  // itself, not from the raw catalog entity — this is that endpoint.
  http.get(
    `${SCAFFOLDER_BASE}/v2/templates/default/template/nfs-stock-pickers-template/parameter-schema`,
    () =>
      HttpResponse.json({
        title: 'Stock pickers',
        steps: [
          {
            title: 'Stock pickers',
            schema: fixtureTemplate.spec!.parameters,
          },
        ],
      }),
  ),
);
registerMswTestHooks(server);

describe('scaffolder /create, Templates sub-page and stock field pickers (upstream @backstage/plugin-scaffolder defaults)', () => {
  it('resolves the /create route registered by @backstage/plugin-scaffolder', async () => {
    renderTestApp({
      // appApisModule is included because PageBlueprint (used by every page this
      // plugin registers) unconditionally requires pluginHeaderActionsApiRef,
      // which only this app's apis.ts provides a default for — see catalog.test.tsx.
      features: [scaffolderPlugin, appApisModule],
      initialRouteEntries: ['/create'],
    });

    await waitFor(() => {
      expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();
    });
  });

  it('lists the real fixture template on the Templates sub-page', async () => {
    renderTestApp({
      // catalogPlugin is required here (unlike the bare /create test above)
      // because the Templates sub-page's list view reuses catalog-react's
      // EntityListProvider/EntityKindPicker etc., which resolve catalogApiRef
      // — an upstream cross-plugin dependency, not something this app wires.
      features: [scaffolderPlugin, catalogPlugin, appApisModule],
      initialRouteEntries: ['/create/templates'],
    });

    await waitFor(
      () => {
        expect(screen.getAllByText('nfs-stock-pickers-template').length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
  });

  it('renders all 10 stock FormFieldBlueprint pickers for the real fixture template', async () => {
    renderTestApp({
      // catalogPlugin is required because several stock pickers (EntityPicker,
      // OwnerPicker, MyGroupsPicker, OwnedEntityPicker, EntityTagsPicker,
      // MultiEntityPicker) resolve catalogApiRef to search/list entities.
      features: [scaffolderPlugin, catalogPlugin, appApisModule],
      initialRouteEntries: ['/create/templates/default/nfs-stock-pickers-template'],
      // A custom `config` replaces renderTestApp's default config wholesale
      // rather than merging with it, so backend.baseUrl has to be repeated
      // here — otherwise discoveryApi.getBaseUrl() throws for every plugin.
      config: {
        backend: { baseUrl: 'http://localhost:7007' },
        integrations: {
          github: [{ host: 'github.com' }],
          gitlab: [{ host: 'gitlab.com' }],
        },
      },
    });

    for (const label of [
      'Repo URL Field',
      'Entity Name Field',
      'Entity Field',
      'Owner Field',
      'Entity Tags Field',
      'Multi Entity Field',
      'My Groups Field',
      'Owned Entity Field',
      'Repo Branch Field',
      'Repo Owner Field',
    ]) {
      await waitFor(() => {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      });
    }
  });
});
