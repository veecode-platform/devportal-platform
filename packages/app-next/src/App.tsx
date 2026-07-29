import { dynamicFrontendFeaturesLoader } from '@backstage/frontend-dynamic-feature-loader';
import { createApp } from '@backstage/frontend-defaults';
import '@backstage/ui/css/styles.css';

const app = createApp({
  features: [dynamicFrontendFeaturesLoader()],
});

export default app.createRoot();
