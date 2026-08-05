import { dynamicFrontendFeaturesLoader } from '@backstage/frontend-dynamic-feature-loader';
import { createApp } from '@backstage/frontend-defaults';
import { globalHeaderModule } from '@red-hat-developer-hub/backstage-plugin-global-header';
import '@backstage/ui/css/styles.css';

import { veecodeGlobalHeaderModule } from './veecodeGlobalHeader';

const app = createApp({
  features: [
    dynamicFrontendFeaturesLoader(),
    globalHeaderModule,
    veecodeGlobalHeaderModule,
  ],
});

export default app.createRoot();
