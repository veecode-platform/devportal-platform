import { dynamicFrontendFeaturesLoader } from '@backstage/frontend-dynamic-feature-loader';
import { createApp } from '@backstage/frontend-defaults';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
// T5.3: 2.0.0 promoted the NFS plugin from ./alpha to the package main entry;
// ./alpha now only re-exports translations. Import path, not shape, is what
// changed.
import { globalHeaderModule } from '@red-hat-developer-hub/backstage-plugin-global-header';
import '@backstage/ui/css/styles.css';
import { apis } from './apis';
import { signInPage } from './signIn';
import { translations } from './translations';
import authPlugin from '@backstage/plugin-auth';

// Adds this app's own API factories (toast, visits and the OIDC/Auth0/SAML auth
// bridges — see apis.ts for what's registered here vs. what @backstage/plugin-app
// already provides by default) on top of the 'app' plugin, the same pluginId
// @backstage/plugin-app itself uses. This only *adds* extensions to that plugin id;
// it does not replace or duplicate its defaults.
export const appApisModule = createFrontendModule({
  pluginId: 'app',
  extensions: apis,
});

// T4.1: same pluginId ('app') and no explicit name as DefaultSignInPage, so this
// resolves to the same extension id (sign-in-page:app) that DefaultSignInPage
// gets. resolveAppNodeSpecs (@backstage/frontend-app-api) lets a module extension
// replace a plugin's own extension of the same id instead of erroring as a
// duplicate — see signIn.test.tsx for the proof this actually replaces it.
export const appSignInModule = createFrontendModule({
  pluginId: 'app',
  extensions: [signInPage],
});

// T4.7: EN overrides for 5 upstream translation refs (scaffolder, catalog-import,
// core-components, search, user-settings) plus this app's own 'rhdh' namespace (see
// ./translations/rhdh.ts — that one needs no extension, just the ref definition).
// TranslationBlueprint (@backstage/plugin-app-react) attaches each to
// api:app/translations, same pluginId as appApisModule/appSignInModule above — required
// here, not just conventional: @backstage/plugin-app's TranslationsApi factory warns on
// (and will eventually ignore) translation extensions registered under any other
// plugin id. See translations.test.tsx for proof these are actually applied, not just
// present as module objects.
export const appTranslationsModule = createFrontendModule({
  pluginId: 'app',
  extensions: translations,
});

import { veecodeGlobalHeaderModule } from './veecodeGlobalHeader';

const app = createApp({
  features: [
    dynamicFrontendFeaturesLoader(),
    appApisModule,
    appSignInModule,
    appTranslationsModule,
    // T4.2: @backstage/plugin-auth (pluginId 'auth') registers a real page at
    // /oauth2/authorize/:sessionId that talks to the exact same backend contract
    // as this app's OFS ConsentPage.tsx — GET/POST {authBaseUrl}/v1/sessions/:id
    // [/approve|reject], redirecting via the returned redirectUrl. See
    // consent.test.tsx for the discriminating-test evidence. It declares no
    // title/icon, so — like the OFS route it replaces — it stays out of the
    // auto-inferred nav.
    authPlugin,
    // T5.3. These two are modules, not the plugin, so features[] is where they
    // belong under OFS-NFS-D-006: the global-header PLUGIN arrives through
    // app.packages.include (its "." export declares
    // "backstage": "@backstage/FrontendPlugin"), while globalHeaderModule is a
    // FrontendModule that mounts the header, and veecodeGlobalHeaderModule is
    // this app's own. This is also the exact shape that was proven rendering in
    // a browser, so it is not being changed on aesthetic grounds.
    globalHeaderModule,
    veecodeGlobalHeaderModule,
  ],
});

export default app.createRoot();
