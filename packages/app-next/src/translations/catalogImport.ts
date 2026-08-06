import { TranslationBlueprint } from '@backstage/plugin-app-react';
import { createTranslationMessages } from '@backstage/frontend-plugin-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { catalogImportTranslationRef } from '@backstage/plugin-catalog-import/alpha';

// Ported from packages/app/src/translations/catalog-import/catalog-import-en.ts.
// Upstream's own defaults for both keys are "Register an existing component" (see
// node_modules/@backstage/plugin-catalog-import/dist/alpha.d.ts); OFS overrides both to
// the same "Import an existing Git repository" wording used for the scaffolder override
// in ./scaffolder.ts, so the two entry points into the same repo-import flow read
// consistently.
export const catalogImportTranslations: ExtensionDefinition = TranslationBlueprint.make({
  name: 'catalog-import',
  params: {
    resource: createTranslationMessages({
      ref: catalogImportTranslationRef,
      full: false,
      messages: {
        'defaultImportPage.headerTitle': 'Import an existing Git repository',
        'importInfoCard.title': 'Import an existing Git repository',
      },
    }),
  },
});
