/*
 * Initializes Backstage backend.
 *
 * Parts of this file were based on Red Hat RHDH implementation, specially the dynamic plugin handling
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';
import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';

import {
  CommonJSModuleLoader,
  dynamicPluginsFeatureLoader,
  dynamicPluginsFrontendServiceRef,
} from '@backstage/backend-dynamic-feature-service';

import { createServiceFactory } from '@backstage/backend-plugin-api';
import { PackageRoles } from '@backstage/cli-node';

import * as path from 'path';

import { configureCorporateProxyAgent } from './corporate-proxy';
import { getDefaultServiceFactories } from './defaultServiceFactories';
import {
  healthCheckPlugin,
  versionPlugin,
  pluginIDProviderService,
  rbacDynamicPluginsProvider,
} from './modules';
import { userSettingsBackend } from './modules/userSettings';
// DISABLED: See comment below near catalog plugins section
// import { githubOrgTransformersModule } from './modules/githubOrgTransformers';

// Create a logger to cover logging static initialization tasks
const staticLogger = WinstonLogger.create({
  meta: { service: 'veecode-devportal-init' },
});
staticLogger.info('Starting DevPortal backend');

configureCorporateProxyAgent();

const backend = createBackend();

staticLogger.info('Adding DevPortal default service factories');
const defaultServiceFactories = getDefaultServiceFactories({
  logger: staticLogger,
});
defaultServiceFactories.forEach(serviceFactory => {
  backend.add(serviceFactory);
});
staticLogger.info('Adding DevPortal default service factories: DONE');

backend.add(
  dynamicPluginsFeatureLoader({
    schemaLocator(pluginPackage) {
      const platform = PackageRoles.getRoleInfo(
        pluginPackage.manifest.backstage.role,
      ).platform;
      return path.join(
        platform === 'node' ? 'dist' : 'dist-scalprum',
        'configSchema.json',
      );
    },

    moduleLoader: logger =>
      new CommonJSModuleLoader({
        logger,
        // Customize dynamic plugin packager resolution to support the case
        // of dynamic plugin wrapper packages.
        customResolveDynamicPackage(
          _,
          searchedPackageName,
          scannedPluginManifests,
        ) {
          for (const [realPath, pkg] of scannedPluginManifests.entries()) {
            // A dynamic plugin wrapper package has a direct dependency to the wrapped package
            if (
              Object.keys(pkg.dependencies ?? {}).includes(searchedPackageName)
            ) {
              const searchPath = path.resolve(realPath, 'node_modules');
              try {
                const resolvedPath = require.resolve(
                  `${searchedPackageName}/package.json`,
                  {
                    paths: [searchPath],
                  },
                );
                logger.info(
                  `Resolved '${searchedPackageName}' at ${resolvedPath}`,
                );
                return resolvedPath;
              } catch (e) {
                this.logger.error(
                  `Error when resolving '${searchedPackageName}' with search path: '[${searchPath}]'`,
                  e instanceof Error ? e : undefined,
                );
              }
            }
          }
          return undefined;
        },
      }),
  }),
);

if (
  (process.env.ENABLE_STANDARD_MODULE_FEDERATION || '').toLocaleLowerCase() !==
  'true'
) {
  // When the `dynamicPlugins` entry exists in the configuration, the upstream dynamic plugins backend feature loader
  // also loads the `dynamicPluginsFrontendServiceRef` service that installs an http router to serve
  // standard Module Federation assets for every installed dynamic frontend plugin.
  // For now in RHDH the old frontend application doesn't use standard module federation and, by default,
  // exported RHDH dynamic frontend plugins don't contain standard module federation assets.
  // That's why we disable (bu overriding it with a noop) this service unless stadard module federation use
  // is explicitly requested.
  backend.add(
    createServiceFactory({
      service: dynamicPluginsFrontendServiceRef,
      deps: {},
      factory: () => ({
        setResolverProvider() {},
      }),
    }),
  );
}

backend.add(healthCheckPlugin);
backend.add(versionPlugin);

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));

// catalog related plugins
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);
// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));
// TODO: Probably we should now provide this as a dynamic plugin
backend.add(import('@backstage/plugin-catalog-backend-module-openapi'));
backend.add(import('@backstage/plugin-catalog-backend-module-github-org'));

// DISABLED: Custom GitHub Org transformer for email population
// Reason: GitHub API does not return email fields when using GitHub Apps (only for personal access tokens)
// Backstage's provider doesn't even request the field for GitHub Apps since GitHub won't send it
// Issue: https://github.com/backstage/backstage/issues/25556
// The transformer works correctly but receives no email data from GitHub API
// Re-enable only if GitHub API changes to support email fields for GitHub Apps
// backend.add(githubOrgTransformersModule);

backend.add(import('@backstage/plugin-catalog-backend-module-github'));
backend.add(import('@backstage/plugin-catalog-backend-module-msgraph'));
backend.add(import('@backstage/plugin-catalog-backend-module-azure'));
backend.add(
  import(
    '@backstage-community/plugin-catalog-backend-module-azure-devops-annotator-processor'
  ),
);
backend.add(
  import('@backstage-community/plugin-catalog-backend-module-keycloak'),
);
backend.add(import('@backstage/plugin-catalog-backend-module-ldap'));
backend.add(import('@backstage/plugin-catalog-backend-module-gitlab'));
backend.add(import('@backstage/plugin-catalog-backend-module-gitlab-org'));
backend.add(
  import(
    '@backstage/plugin-catalog-backend-module-incremental-ingestion'
  ),
);

// scaffolder plugin
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(
  import('@backstage/plugin-scaffolder-backend-module-notifications'),
);
backend.add(
  import('@backstage-community/plugin-scaffolder-backend-module-annotator'),
);
backend.add(import('@roadiehq/scaffolder-backend-module-utils'));
backend.add(import('@roadiehq/scaffolder-backend-module-http-request'));
backend.add(import('@roadiehq/scaffolder-backend-module-aws'));
backend.add(
  import('@backstage-community/plugin-scaffolder-backend-module-sonarqube'),
);
backend.add(import('@roadiehq/scaffolder-backend-argocd'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-azure'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-gitlab'));
backend.add(
  import('@backstage-community/plugin-scaffolder-backend-module-azure-devops'),
);
backend.add(
  import('@backstage-community/plugin-scaffolder-backend-module-jenkins'),
);
backend.add(import('@veecode-platform/plugin-scaffolder-backend-module-kong'));

// techdocs plugin
backend.add(import('@backstage/plugin-techdocs-backend'));

// TODO: We should test it more deeply. The structure is not exactly the same as the old backend implementation
backend.add(import('@backstage/plugin-events-backend'));

// permission plugin & RBAC
// Note: Load permission plugins AFTER the plugins that define permissions (catalog, scaffolder, etc.)
backend.add(import('@backstage/plugin-permission-backend'));
backend.add(pluginIDProviderService);
backend.add(rbacDynamicPluginsProvider);
backend.add(import('@backstage-community/plugin-rbac-backend'));
// Note: RBAC plugin provides its own permission policy, so we don't use allow-all-policy
staticLogger.info(`RBAC permission policy is ENABLED`);

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider
if (process.env.ENABLE_AUTH_PROVIDER_MODULE_OVERRIDE !== 'true') {
  backend.add(import('./modules/authProvidersModule'));
} else {
  staticLogger.info(`Default authentication provider module disabled`);
}

// MCP actions are added dynamically via dynamic-plugins.yaml when the
// integration is enabled at instance level. Registering them here too
// would crash startup with "Plugin 'mcp-actions' is already registered"
// the moment a SaaS instance turns the feature on.

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend'));

// notifications and signals plugins
backend.add(import('@backstage/plugin-notifications-backend'));
backend.add(import('@backstage/plugin-signals-backend'));

backend.add(import('@internal/plugin-dynamic-plugins-info-backend'));
backend.add(import('@internal/plugin-scalprum-backend'));
backend.add(
  import('@red-hat-developer-hub/backstage-plugin-translations-backend'),
);

backend.add(userSettingsBackend);

backend.start();
