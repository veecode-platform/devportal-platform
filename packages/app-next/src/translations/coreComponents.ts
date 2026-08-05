import { TranslationBlueprint } from '@backstage/plugin-app-react';
import { createTranslationMessages } from '@backstage/frontend-plugin-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { coreComponentsTranslationRef } from '@backstage/core-components/alpha';

// packages/app/src/translations/core-components/core-components-en.ts overrides 13 keys
// as a defensive pin against *other* dynamic plugins bundling an older
// @backstage/core-components whose translation.ts is missing keys added in later
// Backstage releases (see that file's own comment + RHDHBUGS-1235/1976). app-next has a
// single pinned core-components (0.18.12, already has all 13 keys — verified against
// node_modules/@backstage/core-components/dist/alpha.d.ts) and no dynamic-plugin
// version skew, so porting those 13 verbatim would be a byte-for-byte no-op: not a real
// override, and not something a test could tell apart from "never wired at all".
//
// What IS a real, testable override here: SignInPage's per-provider action button (see
// node_modules/@backstage/core-components/dist/layout/SignInPage/commonProvider.esm.js)
// reads its label from coreComponentsTranslationRef's "signIn.title" key, upstream
// default "Sign In". This is the one core-components string this app actually renders
// today — via signIn.tsx's GitLab provider card, live in the running app-next — so it
// doubles as this task's real-browser custom-wording proof (see translations.test.tsx
// and the browser evidence in the T4.7 report).
export const coreComponentsTranslations: ExtensionDefinition = TranslationBlueprint.make({
  name: 'core-components',
  params: {
    resource: createTranslationMessages({
      ref: coreComponentsTranslationRef,
      full: false,
      messages: {
        'signIn.title': 'Enter DevPortal',
      },
    }),
  },
});
