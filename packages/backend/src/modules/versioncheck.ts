import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { promises as fs } from 'fs';
import path from 'path';

export const versionPlugin = createBackendPlugin({
  pluginId: 'version',
  register(reg) {
    reg.registerInit({
      deps: {
        rootHttpRouter: coreServices.rootHttpRouter,
      },
      async init({ rootHttpRouter }) {
        rootHttpRouter.use('/version', async (_req, res) => {
          try {
            // Resolve the path to the repository root backstage.json
            // Try a couple of common locations depending on runtime/workdir
            const candidates = [
              // When running from packages/backend as CWD
              path.resolve(process.cwd(), '../../backstage.json'),
              // When running from compiled dist/modules directory
              path.resolve(__dirname, '../../../../backstage.json'),
              // Fallback: relative to compiled dist
              path.resolve(__dirname, '../../../backstage.json'),
            ];

            let filePath: string | undefined;
            for (const candidate of candidates) {
              try {
                await fs.access(candidate);
                filePath = candidate;
                break;
              } catch {
                // try next
              }
            }

            if (!filePath) {
              throw new Error('backstage.json not found in expected locations');
            }

            const content = await fs.readFile(filePath, 'utf-8');
            res.status(200).type('application/json').send(content);
          } catch (e) {
            res
              .status(500)
              .json({ error: 'Failed to read backstage.json', details: (e as Error).message });
          }
        });
      },
    });
  },
});

