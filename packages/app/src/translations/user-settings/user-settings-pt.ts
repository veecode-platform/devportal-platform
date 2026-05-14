import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';
import { userSettingsTranslationRef } from '@backstage/plugin-user-settings/alpha';

const pt = createTranslationMessages({
  ref: userSettingsTranslationRef,
  full: false,
  messages: {
    sidebarTitle: 'Configurações',
  },
});

export default pt;
