import { dynamicFrontendFeaturesLoader } from '@backstage/frontend-dynamic-feature-loader';
import { createApp } from '@backstage/frontend-defaults';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import '@backstage/ui/css/styles.css';
import { apis } from './apis';

// Adds this app's own API factories (toast, visits and the OIDC/Auth0/SAML auth
// bridges — see apis.ts for what's registered here vs. what @backstage/plugin-app
// already provides by default) on top of the 'app' plugin, the same pluginId
// @backstage/plugin-app itself uses. This only *adds* extensions to that plugin id;
// it does not replace or duplicate its defaults.
export const appApisModule = createFrontendModule({
  pluginId: 'app',
  extensions: apis,
});

const app = createApp({
  features: [dynamicFrontendFeaturesLoader(), appApisModule],
});

export default app.createRoot();
