import {
  createApiRef,
  type ApiRef,
  type BackstageIdentityApi,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type SessionApi,
} from '@backstage/core-plugin-api';

// Backstage does not ship these as core ApiRefs in either frontend system — OFS
// defines the same three locally in packages/app/src/api/AuthApiRefs.ts. Ported
// verbatim (same ids) since ApiRef resolution is id-based and system-agnostic.
type CustomAuthApiRefType = OAuthApi &
  OpenIdConnectApi &
  ProfileInfoApi &
  BackstageIdentityApi &
  SessionApi;

export const oidcAuthApiRef: ApiRef<CustomAuthApiRefType> = createApiRef({
  id: 'internal.auth.oidc',
});

export const auth0AuthApiRef: ApiRef<CustomAuthApiRefType> = createApiRef({
  id: 'internal.auth.auth0',
});

export const samlAuthApiRef: ApiRef<CustomAuthApiRefType> = createApiRef({
  id: 'internal.auth.saml',
});
