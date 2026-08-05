import { createTranslationRef } from '@backstage/frontend-plugin-api';

// Ported from packages/app/src/translations/rhdh/ref.ts. Unlike the other five files in
// this directory, this is not an override of an upstream plugin's translation ref —
// 'rhdh' is this app's OWN namespace (OFS's name for it, kept here for continuity: this
// is NOT RHDH-the-product, it's VeeCode's app-level menu/sign-in/error strings). OFS
// defines the ref directly in packages/app, which app-next cannot import at runtime
// (it's the OFS app bundle, not a published library), so it's redefined here verbatim:
// same id ('rhdh'), same English messages.
//
// Because this app owns the ref, English isn't an "override" the way it is for the
// other five areas — it's the ref's own base `messages`, exactly as OFS's ref.ts defines
// it (see that file's createTranslationRef call). OFS's own index.ts confirms this: its
// translations map only carries non-English locales (de/fr/it/es/pt) — there's no `en`
// entry, because English already lives here. So this file alone is the complete T4.7
// port for this area; there is no separate TranslationBlueprint registration to add for
// EN (translations.test.tsx proves useTranslationRef resolves it without one).
export const rhdhMessages = {
  menuItem: {
    home: 'Home',
    myGroup: 'My Group',
    catalog: 'Catalog',
    apis: 'APIs',
    learningPaths: 'Learning Paths',
    selfService: 'Self-service',
    userSettings: 'User Settings',
    administration: 'Administration',
    extensions: 'Extensions',
    create: 'Create',

    clusters: 'Clusters',
    rbac: 'RBAC',
    bulkImport: 'Bulk import',
    docs: 'Docs',
    lighthouse: 'Lighthouse',
    techRadar: 'Tech Radar',
    orchestrator: 'Orchestrator',
    adoptionInsights: 'Adoption Insights',

    notifications: 'Notifications',
  },
  sidebar: {
    menu: 'Menu',
    home: 'Home',
    homeLogo: 'Home logo',
    signOut: 'Sign Out',
  },
  signIn: {
    page: {
      title: 'Select a sign-in method',
    },
    providers: {
      auth0: {
        title: 'Auth0',
        message: 'Sign in using Auth0',
      },
      atlassian: {
        title: 'Atlassian',
        message: 'Sign in using Atlassian',
      },
      bitbucket: {
        title: 'Bitbucket',
        message: 'Sign in using Bitbucket',
      },
      bitbucketServer: {
        title: 'Bitbucket Server',
        message: 'Sign in using Bitbucket Server',
      },
      github: {
        title: 'GitHub',
        message: 'Sign in using GitHub',
      },
      gitlab: {
        title: 'GitLab',
        message: 'Sign in using GitLab',
      },
      keycloak: {
        title: 'Keycloak',
        message: 'Sign in using Keycloak',
      },
      microsoft: {
        title: 'Azure',
        message: 'Sign in using Azure',
      },
      google: {
        title: 'Google',
        message: 'Sign in using Google',
      },
      oidc: {
        title: 'OIDC',
        message: 'Sign in using OIDC',
      },
      okta: {
        title: 'Okta',
        message: 'Sign in using Okta',
      },
      onelogin: {
        title: 'OneLogin',
        message: 'Sign in using OneLogin',
      },
      saml: {
        title: 'SAML',
        message: 'Sign in using SAML',
      },
    },
  },
  app: {
    scaffolder: {
      title: 'Self-service',
    },
    search: {
      title: 'Search',
      resultType: 'Result Type',
      softwareCatalog: 'Software Catalog',
      filters: {
        kind: 'Kind',
        lifecycle: 'Lifecycle',
        component: 'Component',
        template: 'Template',
        experimental: 'experimental',
        production: 'production',
      },
    },
    learningPaths: {
      title: 'Learning Paths',
      error: {
        title: 'Could not fetch data.',
        unknownError: 'Unknown error',
      },
    },
    entityPage: {
      diagram: {
        title: 'System Diagram',
      },
    },
    userSettings: {
      infoCard: {
        title: 'VeeCode DevPortal Metadata',
        metadataCopied: 'Metadata copied to clipboard',
        copyMetadata: 'Copy metadata to your clipboard',
        showLess: 'Show less',
        showMore: 'Show more',
      },
    },
    errors: {
      contactSupport: 'Contact support',
      goBack: 'Go back',
      notFound: {
        message: "We couldn't find that page",
        additionalInfo:
          'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.',
      },
    },
    table: {
      createdAt: 'Created At',
    },
  },
};

export const rhdhTranslationRef = createTranslationRef({
  id: 'rhdh',
  messages: rhdhMessages,
});
