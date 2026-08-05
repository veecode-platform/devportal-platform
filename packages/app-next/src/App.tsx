import { dynamicFrontendFeaturesLoader } from '@backstage/frontend-dynamic-feature-loader';
import { createApp } from '@backstage/frontend-defaults';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import '@backstage/ui/css/styles.css';
import { apis } from './apis';
import { signInPage } from './signIn';
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

const app = createApp({
  features: [
    dynamicFrontendFeaturesLoader(),
    appApisModule,
    appSignInModule,
    // T4.2: @backstage/plugin-auth (pluginId 'auth') registers a real page at
    // /oauth2/authorize/:sessionId that talks to the exact same backend contract
    // as this app's OFS ConsentPage.tsx — GET/POST {authBaseUrl}/v1/sessions/:id
    // [/approve|reject], redirecting via the returned redirectUrl. See
    // consent.test.tsx for the discriminating-test evidence. It declares no
    // title/icon, so — like the OFS route it replaces — it stays out of the
    // auto-inferred nav.
    authPlugin,
  ],
});

export default app.createRoot();
