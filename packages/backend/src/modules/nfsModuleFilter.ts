/*
 * Faithful port of RHDH's nfsModuleFilterPlugin (RHIDP-15377), kept aligned with
 * upstream on purpose — a local copy is only here because this repo is not a fork.
 *
 * Why it exists: when standard Module Federation is on, the dynamic plugins
 * backend announces EVERY exposed module of every installed frontend plugin to
 * the host. Exported OFS bundles expose Scalprum-shaped modules alongside any NFS
 * entrypoint, and the NFS host cannot tell them apart from the remote manifest —
 * it will try to consume them as features and fail, or register nothing while
 * looking healthy.
 *
 * The filter reads each plugin package's own `backstage.features` map, which the
 * exporter writes, and keeps only the entries whose declared type is an NFS
 * feature. A package that declares no features map is left untouched (returns
 * undefined), so this is additive: nothing that works today starts being filtered.
 */
import {
  dynamicPluginsFrontendServiceRef,
  FrontendRemoteResolverProvider,
} from '@backstage/backend-dynamic-feature-service';
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';

import * as fs from 'node:fs';
import * as path from 'node:path';

const NFS_FEATURE_TYPES = new Set([
  '@backstage/FrontendPlugin',
  '@backstage/FrontendModule',
]);

export const nfsModuleFilterPlugin = createBackendPlugin({
  pluginId: 'nfs-module-filter',
  register(reg) {
    reg.registerInit({
      deps: {
        frontendRemotes: dynamicPluginsFrontendServiceRef,
        logger: coreServices.rootLogger,
      },
      async init({ frontendRemotes, logger }) {
        const provider: FrontendRemoteResolverProvider = {
          for(pluginName, pluginPackagePath) {
            let features: Record<string, string> | undefined;
            try {
              const pkgJsonPath = path.join(pluginPackagePath, 'package.json');
              const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
              features = pkgJson.backstage?.features;
            } catch (error) {
              logger.warn(
                `nfs-module-filter: failed to read package.json for plugin '${pluginName}': ${error}`,
              );
              return undefined;
            }

            if (!features || Object.keys(features).length === 0) {
              return undefined;
            }

            return {
              overrideExposedModules(exposedModules) {
                const kept: string[] = [];
                const removed: string[] = [];

                for (const moduleName of exposedModules) {
                  const mount =
                    moduleName === '.' || moduleName.startsWith('./')
                      ? moduleName
                      : `./${moduleName}`;
                  const featureType = features![mount];

                  if (
                    featureType !== undefined &&
                    NFS_FEATURE_TYPES.has(featureType)
                  ) {
                    kept.push(moduleName);
                  } else {
                    removed.push(moduleName);
                  }
                }

                if (removed.length > 0) {
                  logger.info(
                    `nfs-module-filter: plugin '${pluginName}': kept [${kept.join(', ')}], filtered out [${removed.join(', ')}]`,
                  );
                }

                return kept;
              },
            };
          },
        };

        frontendRemotes.setResolverProvider(provider);
        logger.info(
          'nfs-module-filter: registered frontend remote resolver provider',
        );
      },
    });
  },
});
