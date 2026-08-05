import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useTranslationRef } from '@backstage/frontend-plugin-api';
import { scaffolderTranslationRef } from '@backstage/plugin-scaffolder/alpha';
import { catalogImportTranslationRef } from '@backstage/plugin-catalog-import/alpha';
import { coreComponentsTranslationRef } from '@backstage/core-components/alpha';
import { searchTranslationRef } from '@backstage/plugin-search/alpha';
import { userSettingsTranslationRef } from '@backstage/plugin-user-settings/alpha';
import { appTranslationsModule } from './App';
import { rhdhTranslationRef } from './translations';

// One component resolving all 6 areas' refs through the real useTranslationRef hook —
// the same hook every plugin's own components call — so a passing render is a
// resolution proof, not a "the module object exists" check.
function TranslationProbe() {
  const { t: tScaffolder } = useTranslationRef(scaffolderTranslationRef);
  const { t: tCatalogImport } = useTranslationRef(catalogImportTranslationRef);
  const { t: tCoreComponents } = useTranslationRef(coreComponentsTranslationRef);
  const { t: tSearch } = useTranslationRef(searchTranslationRef);
  const { t: tUserSettings } = useTranslationRef(userSettingsTranslationRef);
  const { t: tRhdh } = useTranslationRef(rhdhTranslationRef);

  const checks = {
    scaffolder: tScaffolder(
      'templateListPage.contentHeader.registerExistingButtonTitle',
    ),
    catalogImport: tCatalogImport('defaultImportPage.headerTitle'),
    coreComponents: tCoreComponents('signIn.title'),
    search: tSearch('sidebarSearchModal.title'),
    userSettings: tUserSettings('appearanceCard.title'),
    rhdh: tRhdh('sidebar.signOut'),
  };
  return <pre data-testid="translation-probe">{JSON.stringify(checks)}</pre>;
}

describe('T4.7 EN translation overrides (6 areas)', () => {
  it('resolves this app’s custom EN wording — not the upstream default — for every overridden ref, with appTranslationsModule wired in', () => {
    const { getByTestId } = renderInTestApp(<TranslationProbe />, {
      features: [appTranslationsModule],
    });

    const checks = JSON.parse(getByTestId('translation-probe').textContent!);
    expect(checks).toEqual({
      scaffolder: 'Import an existing Git repository',
      catalogImport: 'Import an existing Git repository',
      coreComponents: 'Enter DevPortal',
      search: 'Search everything',
      userSettings: 'Look & Feel',
      rhdh: 'Sign Out',
    });
  });

  // The discriminating half: without appTranslationsModule, 5 of the 6 keys fall back
  // to each ref's OWN upstream default (proving the previous test's values came from
  // our registered overrides, not from the refs' baked-in defaults — this is what makes
  // the assertion above fail if the override ever stops being applied, e.g. if App.tsx
  // stopped wiring appTranslationsModule in, or attachTo broke). 'rhdh' is the exception
  // by construction: it's this app's own ref, not an override of anyone else's, so its
  // one message is available whether or not any translation module is registered — see
  // ./translations/rhdh.ts.
  it('falls back to each ref’s upstream default when appTranslationsModule is left out, proving the override — not the ref’s own default — produced the previous result', () => {
    const { getByTestId } = renderInTestApp(<TranslationProbe />, {
      features: [],
    });

    const checks = JSON.parse(getByTestId('translation-probe').textContent!);
    expect(checks).toEqual({
      scaffolder: 'Register Existing Component',
      catalogImport: 'Register an existing component',
      coreComponents: 'Sign In',
      search: 'Search',
      userSettings: 'Appearance',
      rhdh: 'Sign Out',
    });
  });
});
