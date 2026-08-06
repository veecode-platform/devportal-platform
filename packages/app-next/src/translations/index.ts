import type { ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { scaffolderTranslations } from './scaffolder';
import { catalogImportTranslations } from './catalogImport';
import { coreComponentsTranslations } from './coreComponents';
import { searchTranslations } from './search';
import { userSettingsTranslations } from './userSettings';

export { rhdhTranslationRef, rhdhMessages } from './rhdh';

// The 5 EN overrides that need registering (see each file for why 'rhdh' — this app's
// own translation namespace, not an override of an upstream ref — needs no separate
// registration for its EN base). Each is a TranslationBlueprint extension with a
// distinct `name`, all attaching to the same api:app/translations input — see App.tsx
// for why they're wired through pluginId 'app' specifically (that input's own factory,
// @backstage/plugin-app's TranslationsApi, warns and will eventually ignore any
// translation extension registered under a different plugin id).
export const translations: ExtensionDefinition[] = [
  scaffolderTranslations,
  catalogImportTranslations,
  coreComponentsTranslations,
  searchTranslations,
  userSettingsTranslations,
];
