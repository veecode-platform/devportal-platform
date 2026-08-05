import { TranslationBlueprint } from '@backstage/plugin-app-react';
import { createTranslationMessages } from '@backstage/frontend-plugin-api';
import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { userSettingsTranslationRef } from '@backstage/plugin-user-settings/alpha';

// packages/app/src/translations/user-settings/user-settings-en.ts only overrides
// 'sidebarTitle', to 'Settings' — identical to userSettingsTranslationRef's own upstream
// default (see node_modules/@backstage/plugin-user-settings/dist/alpha.d.ts) and, under
// NFS, a key the alpha plugin's own page/sub-page extensions don't even read (it backs
// the *old* index.ts SidebarItem, not the alpha PageBlueprint — see
// node_modules/@backstage/plugin-user-settings/dist/components/Settings.esm.js). Neither
// porting it nor overriding it would be observable here.
//
// 'appearanceCard.title' (upstream default "Appearance") IS read by the alpha plugin:
// UserSettingsAppearanceCard's InfoCard title, rendered on the General tab right next to
// the theme toggle (see
// node_modules/@backstage/plugin-user-settings/dist/components/General/
// UserSettingsAppearanceCard.esm.js). That makes it both a real override this app's own
// key set didn't have before, and — once T4.8 mounts this plugin's alpha extensions — a
// second real-browser-visible custom wording alongside T4.7's core-components one.
export const userSettingsTranslations: ExtensionDefinition = TranslationBlueprint.make({
  name: 'user-settings',
  params: {
    resource: createTranslationMessages({
      ref: userSettingsTranslationRef,
      full: false,
      messages: {
        'appearanceCard.title': 'Look & Feel',
      },
    }),
  },
});
