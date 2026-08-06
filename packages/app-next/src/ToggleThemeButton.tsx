import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { appThemeApiRef, useApi } from '@backstage/core-plugin-api';
import { useTheme } from '@mui/material/styles';
import type { MouseEvent } from 'react';

/**
 * Adapted from the VeeCode fork's own ToggleThemeButton implementation at
 * `workspaces/global-header/plugins/veecode-global-header/src/components/ToggleThemeButton`.
 * The fork implements this control itself; it does not re-export Backstage's
 * user-settings component. The NFS host keeps the behavior local so the OFS
 * fork remains untouched.
 */
export const ToggleThemeButton = () => {
  const appThemeApi = useApi(appThemeApiRef);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const tooltip = isDarkMode ? 'Switch to light theme' : 'Switch to dark theme';

  const handleSetTheme = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const newThemeId = isDarkMode ? 'light' : 'dark';
    const installedThemes = appThemeApi.getInstalledThemes();

    appThemeApi.setActiveThemeId(
      installedThemes.some(installedTheme => installedTheme.id === newThemeId)
        ? newThemeId
        : undefined,
    );
  };

  return (
    <Tooltip title={tooltip}>
      <IconButton
        size="small"
        aria-label="Theme"
        aria-controls="Theme-menu"
        aria-haspopup="true"
        color="inherit"
        sx={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
        }}
        onClick={handleSetTheme}
      >
        {isDarkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  );
};
