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

import { useContext } from 'react';

import { useApi } from '@backstage/core-plugin-api';
import { appLanguageApiRef } from '@backstage/core-plugin-api/alpha';
import {
  UserSettingsAppearanceCard,
  UserSettingsIdentityCard,
  UserSettingsProfileCard,
} from '@backstage/plugin-user-settings';

import Grid from '@mui/material/Grid';
import { ExportTranslationKeys } from '@red-hat-developer-hub/backstage-plugin-translations';
import DynamicRootContext from '@red-hat-developer-hub/plugin-utils';

import { InfoCard } from './InfoCard';

export const GeneralPage = () => {
  const context = useContext(DynamicRootContext);
  const languageApi = useApi(appLanguageApiRef);

  return (
    <Grid container direction="row" spacing={3}>
      <Grid item xs={12} md={6}>
        <UserSettingsProfileCard />
      </Grid>
      <Grid item xs={12} md={6}>
        <UserSettingsAppearanceCard />
      </Grid>
      <Grid item xs={12} md={6}>
        <UserSettingsIdentityCard />
      </Grid>
      <Grid item xs={12} md={6}>
        <InfoCard />
      </Grid>
      {languageApi.getAvailableLanguages().languages.length > 1 && (
        <Grid item xs={12} md={6}>
          <ExportTranslationKeys resources={context.translationRefs} />
        </Grid>
      )}
    </Grid>
  );
};