import { TranslationBlueprint } from '@backstage/plugin-app-react';
import { createTranslationMessages } from '@backstage/frontend-plugin-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { scaffolderTranslationRef } from '@backstage/plugin-scaffolder/alpha';

// Ported from packages/app/src/translations/scaffolder/scaffolder-en.ts. Upstream's own
// default for this key is "Register Existing Component" (see
// node_modules/@backstage/plugin-scaffolder/dist/alpha.d.ts), which OFS overrides to
// match this app's actual "self-service" flow (registering a repo, not scaffolding a
// new one). `full: false` means this is a partial override — every key not listed here
// keeps resolving to scaffolderTranslationRef's own upstream default.
export const scaffolderTranslations: ExtensionDefinition = TranslationBlueprint.make({
  name: 'scaffolder',
  params: {
    resource: createTranslationMessages({
      ref: scaffolderTranslationRef,
      full: false,
      messages: {
        'templateListPage.contentHeader.registerExistingButtonTitle':
          'Import an existing Git repository',
      },
    }),
  },
});
