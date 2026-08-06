import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { ApiBlueprint, createFrontendModule } from '@backstage/frontend-plugin-api';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { appApisModule } from './App';

// The General tab's UserSettingsProfileCard calls useApi(catalogApiRef) unconditionally
// (see node_modules/@backstage/plugin-user-settings/dist/components/
// useUserProfileInfo.esm.js) to look up the signed-in user's catalog entity. With no
// provider at all, that useApi call throws synchronously — not the graceful
// loading/error state useAsync would otherwise give it — which trips
// ExtensionBoundary's error boundary for the whole General tab (confirmed: it rendered
// as a "BackstageWarningPanel" before this fake was added, matching one bare failing
// run of this file). This app has no product need for catalogApiRef yet, so this is a
// test-only minimal fake — no msw, no real CatalogClient — registered as its own
// pluginId:'app' module alongside appApisModule, the same way every other app-authored
// API extension in this codebase is wired (see App.tsx).
const fakeCatalogApi = ApiBlueprint.make({
  name: 'test-catalog-api',
  params: defineParams =>
    defineParams({
      api: catalogApiRef,
      deps: {},
      factory: () => ({ getEntityByRef: async () => undefined } as any),
    }),
});
const testApisModule = createFrontendModule({
  pluginId: 'app',
  extensions: [fakeCatalogApi],
});

// T4.8 — EXTENSION-CONTRACT PROOF, HARNESS LEVEL ONLY. Per OFS-NFS-D-006, stock
// upstream plugins reach the shipped app through app.packages.include in
// app-config.nfs.yaml, not through this app's own features[] in App.tsx (that array is
// reserved for modules this app authors — see App.tsx). app-config.nfs.yaml isn't a
// file this task may edit, so there is nothing to wire here beyond the
// @backstage/plugin-user-settings dependency already added to package.json for T4.7 (it
// needed userSettingsTranslationRef from the same package's /alpha).
//
// Passing userSettingsPlugin directly as a `feature` below proves upstream's own
// extensions do what this app needs (the page, its 3 sub-page tabs, and the theme
// toggle) — it does NOT prove the shipped app actually loads this plugin via the
// allowlist. That second half is a separate, real-browser claim outside this worktree's
// allowed files.
describe('T4.8 upstream @backstage/plugin-user-settings extension contract (harness — not shipped-wiring proof)', () => {
  it('renders /settings, redirecting to the General tab, with all 3 sub-tab labels present', async () => {
    renderTestApp({
      features: [userSettingsPlugin, appApisModule, testApisModule],
      initialRouteEntries: ['/settings'],
    });

    // PageBlueprint's own factory (see node_modules/@backstage/frontend-plugin-api/dist/
    // blueprints/PageBlueprint.esm.js) redirects the bare page path to inputs.pages[0]'s
    // path via <Navigate index replace>, and userSettingsPlugin's extensions array lists
    // generalSettingsPage first — so this is deliberately not asserting on '/settings'
    // staying on that literal path. Each sub-page's content is behind a dynamic
    // import()-based loader (ExtensionBoundary.lazy), so this needs to actually wait for
    // it — a bare queryByText('PAGE NOT FOUND') right after render is trivially null
    // before anything has loaded, which is not the same as the page having resolved.
    // findByText (getBy + waitFor) is the correct primitive here, not a plain assertion.

    // The 3 tab labels PageLayout renders in its <nav> come straight from each
    // sub-page's own `title` param (see plugin-user-settings/dist/alpha.esm.js) — not
    // anything this app supplies.
    expect(await screen.findByText('General')).toBeTruthy();
    expect(screen.getByText('Authentication Providers')).toBeTruthy();
    expect(screen.getByText('Feature Flags')).toBeTruthy();
    expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();

    // Confirms the General tab's own content rendered (UserSettingsGeneral →
    // UserSettingsAppearanceCard → UserSettingsThemeToggle), not just the tab chrome.
    expect(await screen.findByText('Light')).toBeTruthy();
    expect(screen.getByText('Auto')).toBeTruthy();
  });

  it('flips the active theme when a theme toggle button is clicked', async () => {
    renderTestApp({
      features: [userSettingsPlugin, appApisModule, testApisModule],
      initialRouteEntries: ['/settings'],
    });

    // MUI's ToggleButton sets aria-pressed directly from its own `selected` prop (see
    // node_modules/@material-ui/lab/ToggleButton/ToggleButton.js) — a stable,
    // accessibility-contract signal for "which theme is active", not an implementation
    // detail. With no theme picked yet, ToggleButtonGroup's value defaults to 'auto'.
    await screen.findByText('Auto');
    expect(screen.getByText('Auto').closest('button')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('Dark').closest('button')!.getAttribute('aria-pressed')).toBe(
      'false',
    );
    // UnifiedThemeProvider (@backstage/theme) stamps the resolved theme onto <body> as
    // data-theme-mode — the most direct DOM evidence this harness can produce that a
    // theme actually applied, short of a real browser rendering the CSS.
    expect(document.body.getAttribute('data-theme-mode')).toBe('light');

    // Re-querying by text rather than reusing a captured element: React replaces these
    // ToggleButton nodes on re-render rather than mutating them in place, so a node
    // reference taken before the click reads stale attributes afterwards.
    fireEvent.click(screen.getByText('Dark').closest('button')!);

    // appThemeApiRef.setActiveThemeId('dark') (called by UserSettingsThemeToggle's
    // onChange) is what "the theme actually alternates from the picker" means at the
    // API level; data-theme-mode flipping to 'dark' is @backstage/plugin-app's real
    // DarkTheme (registered via ThemeBlueprint) actually taking effect as a result.
    await waitFor(() => {
      expect(document.body.getAttribute('data-theme-mode')).toBe('dark');
    });
    expect(screen.getByText('Dark').closest('button')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('Auto').closest('button')!.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('resolves the /settings/auth-providers sub-tab to its own content, not a 404', async () => {
    renderTestApp({
      features: [userSettingsPlugin, appApisModule],
      initialRouteEntries: ['/settings/auth-providers'],
    });

    // 'No Authentication Providers' (emptyProviders.title) is distinct from the tab's
    // own label ('Authentication Providers'), so finding it proves the AuthProviders
    // sub-page content rendered — not just that the tab nav is showing.
    await waitFor(() => {
      expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();
      expect(screen.getByText('No Authentication Providers')).toBeTruthy();
    });
  });

  it('resolves the /settings/feature-flags sub-tab to its own content, not a 404', async () => {
    renderTestApp({
      features: [userSettingsPlugin, appApisModule],
      initialRouteEntries: ['/settings/feature-flags'],
    });

    // Same distinguishing logic as the auth-providers case above: 'No Feature Flags'
    // (featureFlags.emptyFlags.title) only renders as part of the FeatureFlags
    // sub-page's own empty state.
    await waitFor(() => {
      expect(screen.queryByText('PAGE NOT FOUND')).toBeNull();
      expect(screen.getByText('No Feature Flags')).toBeTruthy();
    });
  });
});
