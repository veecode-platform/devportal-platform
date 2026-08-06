/**
 * Config schema for the NFS host.
 *
 * Load-bearing, and proven so by A/B rather than assumed. app-backend serves the
 * browser only the keys a collected schema marks `@visibility frontend`; a key
 * with no schema is invisible to the frontend however plainly it sits in
 * app-config.
 *
 * The subtlety that cost real time: the image DOES contain
 * packages/app/config.schema.json, and that compiled schema DOES declare
 * `signInPage`. It is still not enough. Schema collection follows the dependency
 * graph of the app named by `app.packageName` — here `app-next` — and that graph
 * does not include packages/app. So the OFS schema is present in the filesystem
 * and never consulted.
 *
 * Measured both ways on the bench, same config, same key: with this file plus its
 * COPY in Dockerfile.nfs, `signInPage: microsoft` renders the Azure card; without
 * them, both a gitlab-configured and a microsoft-configured instance render
 * GitHub. Note that `yarn backstage-cli config:print --frontend` on the host says
 * the key is visible either way — the host has packages/app in the graph, so it
 * cannot answer this question. Only the image can.
 *
 * Only keys app-next itself reads and that no core Backstage schema already
 * covers belong here. `auth.environment`, `app.title` and `app.branding.*` are
 * core keys with their own schemas and already arrive.
 */
export interface Config {
  /**
   * Which sign-in provider the shell offers. One of `github`, `gitlab`,
   * `microsoft`, `keycloak` or `ldap`; anything else falls back to `github`.
   * Read by packages/app-next/src/signIn.tsx. Each auth preset sets it —
   * presets/azure-auth.yaml, github-auth.yaml, gitlab.yaml, keycloak.yaml,
   * ldap.yaml.
   * @visibility frontend
   */
  signInPage?: string;
}
