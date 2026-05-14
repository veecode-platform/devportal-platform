/*
 * Portions of this file are based on code from the Red Hat Developer project:
 * https://github.com/redhat-developer/rhdh/blob/main/packages/app
 *
 * Original Copyright (c) 2022 Red Hat Developer (or the exact copyright holder from the original source, please verify in their repository)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import {
  UnifiedThemeProvider,
  themes as backstageThemes,
} from '@backstage/theme';

/*
 * Loader is rendered before the Backstage App is instantiated — i.e. before
 * DynamicRoot has loaded the dynamic theme plugins. Per ADR-011 Phase 1, the
 * VeeCode theme is delivered as a dynamic frontend plugin (see
 * dynamic-plugins/wrappers/veecode-platform-plugin-veecode-theme);
 * DynamicRoot registers it as an AppThemeProvider in createApp (see
 * DynamicRoot.tsx lines 533-636) and the runtime theme takes effect at the
 * app-mount boundary.
 *
 * Loader covers a short loading window before that. Previously it consumed
 * `useLoaderTheme()` from the RHDH theme package, which HTTP-fetched
 * `/theme.json` baked alongside the app bundle — a mechanism that fights
 * the dynamic-plugin path. We now use Backstage's bundled light theme as a
 * neutral loading-state surface; once createApp mounts, the dynamic
 * VeeCode theme assumes control without a flicker that matters in practice.
 */
const Loader = () => {
  return (
    <UnifiedThemeProvider theme={backstageThemes.light}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    </UnifiedThemeProvider>
  );
};

export default Loader;
