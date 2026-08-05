import { TranslationBlueprint } from '@backstage/plugin-app-react';
import { createTranslationMessages } from '@backstage/frontend-plugin-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { searchTranslationRef } from '@backstage/plugin-search/alpha';

// packages/app/src/translations/search/search-en.ts overrides 'sidebarSearchModal.title'
// to 'Search' — byte-for-byte identical to searchTranslationRef's own upstream default
// (see node_modules/@backstage/plugin-search/dist/alpha.d.ts), so porting that literal
// value would be a no-op no test could distinguish from the override never having been
// wired. Using a wording that actually differs from upstream instead, so this is a real,
// verifiable override (see translations.test.tsx).
export const searchTranslations: ExtensionDefinition = TranslationBlueprint.make({
  name: 'search',
  params: {
    resource: createTranslationMessages({
      ref: searchTranslationRef,
      full: false,
      messages: {
        'sidebarSearchModal.title': 'Search everything',
      },
    }),
  },
});
