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

import { Link, useSidebarOpenState } from '@backstage/core-components';
import { configApiRef, useApi } from '@backstage/core-plugin-api';

import { makeStyles } from 'tss-react/mui';
import { useTheme } from '@mui/material/styles';

import LogoFull from './LogoFull';
import LogoIcon from './LogoIcon';

const useStyles = makeStyles()({
  sidebarLogo: {
    margin: '24px 0px 6px 24px',
  },
});

const LogoRender = ({
  base64Logo,
  defaultLogo,
  width,
}: {
  base64Logo: string | undefined;
  defaultLogo: React.JSX.Element;
  width: string | number;
}) => {
  return base64Logo ? (
    <img
      data-testid="home-logo"
      src={base64Logo}
      alt="Home logo"
      width={width}
    />
  ) : (
    defaultLogo
  );
};

type LogoURLs =
  | {
      /** The logo that will be used in global headers with a light-coloured background */
      light: string;
      /** The logo that will be used in global headers with a dark-coloured background */
      dark: string;
    }
  | string
  | undefined;

// same logic from global header
const useFullLogo = (): string | undefined => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const isDarkMode = theme.palette.mode === 'dark';
  const configApi = useApi(configApiRef);

  /** The fullLogo config specified by app.branding.fullLogo */
  const fullLogo = configApi.getOptional<LogoURLs>('app.branding.fullLogo');
  
  /** The dark theme logo config specified by app.branding.fullLogoDark */
  const fullLogoDark = configApi.getOptional<string>('app.branding.fullLogoDark');

  /** The URI of the logo specified by app.branding.fullLogo */
  const fullLogoURI =
    typeof fullLogo === 'string'
      ? fullLogo
      : fullLogo?.[mode];
  
  /** Use fullLogoDark for dark theme if available, otherwise fall back to fullLogoURI */
  const configLogoURI = isDarkMode && fullLogoDark ? fullLogoDark : fullLogoURI;

  return configLogoURI ?? undefined;
};

export const SidebarLogo = () => {
  const { classes } = useStyles();
  const { isOpen } = useSidebarOpenState();
  const configApi = useApi(configApiRef);
  const logoFullBase64URI = useFullLogo()
  // const logoFullBase64URI = configApi.getOptionalString(
  //   'app.branding.fullLogo',
  // );
  const fullLogoWidth = configApi
    .getOptional('app.branding.fullLogoWidth')
    ?.toString();

  const logoIconBase64URI = configApi.getOptionalString(
    'app.branding.iconLogo',
  );

  return (
    <div className={classes.sidebarLogo}>
      <Link to="/" underline="none" aria-label="Home">
        {isOpen ? (
          <LogoRender
            base64Logo={logoFullBase64URI}
            defaultLogo={<LogoFull />}
            width={fullLogoWidth ?? 170}
          />
        ) : (
          <LogoRender
            base64Logo={logoIconBase64URI}
            defaultLogo={<LogoIcon />}
            width={28}
          />
        )}
      </Link>
    </div>
  );
};
