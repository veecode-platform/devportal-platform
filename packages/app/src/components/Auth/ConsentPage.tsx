import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  Content,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DoNotDisturbOnOutlinedIcon from '@mui/icons-material/DoNotDisturbOnOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

type ConsentSession = {
  id: string;
  clientName: string;
  scope?: string;
  redirectUri: string;
};

type ConsentAction = 'approve' | 'reject';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unexpected error';

export const ConsentPage = () => {
  const { sessionId } = useParams();
  const discoveryApi = useApi(discoveryApiRef);
  const { fetch } = useApi(fetchApiRef);
  const [session, setSession] = useState<ConsentSession>();
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState<ConsentAction>();
  const [error, setError] = useState<Error>();

  const scopes = useMemo(
    () =>
      session?.scope
        ?.split(/\s+/)
        .map(scope => scope.trim())
        .filter(Boolean) ?? [],
    [session?.scope],
  );

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      if (!sessionId) {
        setError(new Error('Missing OAuth session id'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(undefined);

      try {
        const authBaseUrl = await discoveryApi.getBaseUrl('auth');
        const response = await fetch(
          `${authBaseUrl}/v1/sessions/${encodeURIComponent(sessionId)}`,
        );

        if (!response.ok) {
          throw new Error(
            `Unable to load OAuth authorization request (${response.status})`,
          );
        }

        const payload = (await response.json()) as ConsentSession;
        if (!cancelled) {
          setSession(payload);
        }
      } catch (e) {
        if (!cancelled) {
          setError(new Error(getErrorMessage(e)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetch, sessionId]);

  const submitDecision = useCallback(
    async (action: ConsentAction) => {
      if (!sessionId) {
        setError(new Error('Missing OAuth session id'));
        return;
      }

      setSubmittingAction(action);
      setError(undefined);

      try {
        const authBaseUrl = await discoveryApi.getBaseUrl('auth');
        const response = await fetch(
          `${authBaseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/${
            action === 'approve' ? 'approve' : 'reject'
          }`,
          { method: 'POST' },
        );

        if (!response.ok) {
          throw new Error(
            `Unable to ${action} OAuth authorization request (${response.status})`,
          );
        }

        const { redirectUrl } = (await response.json()) as {
          redirectUrl?: string;
        };

        if (!redirectUrl) {
          throw new Error(
            'OAuth authorization response did not include redirectUrl',
          );
        }

        window.location.assign(redirectUrl);
      } catch (e) {
        setError(new Error(getErrorMessage(e)));
        setSubmittingAction(undefined);
      }
    },
    [discoveryApi, fetch, sessionId],
  );

  const isSubmitting = Boolean(submittingAction);

  return (
    <Page themeId="tool">
      <Content>
        <Box
          sx={{
            minHeight: 'calc(100vh - 96px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            py: 6,
          }}
        >
          <Paper
            aria-busy={loading || isSubmitting}
            elevation={1}
            sx={{
              width: '100%',
              maxWidth: 680,
              p: { xs: 3, md: 4 },
              borderRadius: 2,
            }}
          >
            <Stack spacing={3}>
              <Box>
                <Typography variant="h4" component="h1" gutterBottom>
                  Authorize DevPortal access
                </Typography>
                <Typography color="text.secondary">
                  {session
                    ? `${session.clientName} is requesting access to your DevPortal account.`
                    : 'Review the authorization request before continuing.'}
                </Typography>
              </Box>

              {loading && <Progress />}

              {error && (
                <Box role="alert">
                  <ResponseErrorPanel error={error} />
                </Box>
              )}

              {session && !loading && (
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Client
                    </Typography>
                    <Typography variant="body1">
                      {session.clientName}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Redirect target
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {session.redirectUri}
                    </Typography>
                  </Box>

                  {scopes.length > 0 && (
                    <Box>
                      <Typography
                        variant="subtitle2"
                        color="text.secondary"
                        gutterBottom
                      >
                        Requested scopes
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        flexWrap="wrap"
                      >
                        {scopes.map(scope => (
                          <Chip key={scope} label={scope} size="small" />
                        ))}
                      </Stack>
                    </Box>
                  )}

                  {isSubmitting && (
                    <Alert severity="info" role="status">
                      Redirecting to the requesting client.
                    </Alert>
                  )}

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<CheckCircleOutlineIcon />}
                      disabled={isSubmitting}
                      onClick={() => submitDecision('approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="inherit"
                      startIcon={<DoNotDisturbOnOutlinedIcon />}
                      disabled={isSubmitting}
                      onClick={() => submitDecision('reject')}
                    >
                      Deny
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Box>
      </Content>
    </Page>
  );
};
