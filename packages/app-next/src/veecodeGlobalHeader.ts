import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { GlobalHeaderComponentBlueprint } from '@red-hat-developer-hub/backstage-plugin-global-header';

import { ToggleThemeButton } from './ToggleThemeButton';

export const veecodeToggleThemeExtension = GlobalHeaderComponentBlueprint.make({
  name: 'veecode-toggle-theme',
  params: {
    component: ToggleThemeButton,
    priority: 75,
    layout: { flexGrow: 0 },
  },
});

export const veecodeGlobalHeaderModule = createFrontendModule({
  pluginId: 'app',
  extensions: [veecodeToggleThemeExtension],
});
