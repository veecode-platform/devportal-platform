# Presets

Presets are versioned, composable contracts that turn the unified DevPortal
image into a working IDP for a specific situation. Each preset declares:

1. The plugins the situation needs (OCI references or local paths).
2. The environment variables the operator must provide.
3. The `app-config` shape required by those plugins.
4. Optional default `pluginConfig` for mount points, routes, RBAC scope.

A preset is **not** a snippet to copy. It is a structured artifact the
runtime reads at startup. The entrypoint validates `requires.variables`
before the backend boots; missing required vars fail fast with a clear
error pointing at the preset and the variable name.

## Why presets exist

The DevPortal image is intentionally generic. To turn a generic image
into a working IDP, the operator must provide:

- Integration tokens (PATs, OAuth secrets, Keycloak realms).
- Catalog provider configuration.
- Plugin-specific configuration (Kong control plane URL, Sonar URL, etc.).

These are mandatory. The image cannot ship default values because they
are customer-specific. Without presets, this configuration is invisible
until something breaks at runtime — the user discovers required setup
through error messages, not through documentation.

A preset surfaces the contract upfront: "this stack needs X, Y, Z. Set
them or the IDP refuses to boot."

## Tiers

The plugins in the image fall into three tiers. Knowing which tier a
plugin belongs in is the main decision when curating:

| Tier | Always on? | Lives in | Examples | Admission test |
|---|---|---|---|---|
| **Core** | yes — not gated by any preset | the image (baked + enabled) | global header, homepage, About (+backend), dynamic-plugins-info | the app is not usable without it **and** it needs no configuration |
| **`recommended`** | only with `VEECODE_PRESETS=recommended` | `presets/recommended.yaml` | marketplace (+backend), pending-changes, tech-radar (sample data), RBAC (config-only) | it works with **zero configuration** and it makes the image read as a DevPortal rather than a Backstage skeleton |
| **Integration presets** | only when selected | `presets/<name>.yaml` | `github`, `azure`, `gitlab`, `keycloak`, `ldap`, `kong` | it integrates with something customer-specific and therefore *requires* configuration (declared in `requires.variables`) |

If a plugin loads but renders empty or broken without configuration, it
does **not** belong in `recommended` — move it to a named integration
preset with the right `requires.variables`. An empty page in the
out-of-the-box experience is worse than an absent one.

## The curation boundary

A preset carries the configuration that is the **same for everyone** and
stops at the configuration that is **specific to one customer**. It is a
map of the work, not the work done.

- **`requires.variables` is the boundary.** A preset that declares
  required variables is saying: from here on it is customer-specific —
  here is *what* you need and *where the docs are*, but you provide it.
  An integration preset is an engagement scaffold: it makes the shape
  and scope of an integration legible without doing the integration.
- **No business logic — ever.** A preset must not ship an opinionated
  RBAC policy, catalog rules that assume an org structure, or scaffolder
  templates. Those are per-customer implementation artifacts; they live
  in that customer's deployment, not in the shipped catalog. (Sample
  data clearly marked as a sample to be replaced — e.g. a starter
  tech-radar — is fine; it is not business logic.)
- **`recommended` must look polished with zero config and do nothing
  real without it.** Chrome works, there is a homepage, the marketplace
  is browsable, About shows the version — the eval experience is good.
  The moment you want it to integrate a repo, enforce permissions, or
  run a template, you hit a `requires.variables` wall that names what is
  missing and points at the docs. That wall is intentional.

## Schema

See [`SCHEMA.md`](./SCHEMA.md) for the full preset format.

Minimal example:

```yaml
name: github
description: GitHub-integrated IDP stack
version: 1.0.0

requires:
  variables:
    GITHUB_PAT:
      description: Personal Access Token (scope repo + read:org)
      required: true
      docs: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

plugins:
  - package: oci://${PLUGIN_REGISTRY}/github-actions:bs_1.48.4!backstage-community-plugin-github-actions
    disabled: false

appConfig:
  integrations:
    github:
      - host: github.com
        token: ${GITHUB_PAT}
```

## Available presets

| Preset | Description | Required variables |
|---|---|---|
| [`recommended.yaml`](./recommended.yaml) | Curated baseline (marketplace, RBAC, tech-radar, pending-changes) | none |
| [`veecode-theme.yaml`](./veecode-theme.yaml) | VeeCode brand theme (palette + logos) | none |
| [`github.yaml`](./github.yaml) | GitHub-as-SCM: PAT integration + repo discovery + GitHub Actions UI | `GITHUB_PAT`, `GITHUB_ORG` |
| [`github-auth.yaml`](./github-auth.yaml) | GitHub-as-identity: OAuth sign-in + org/team user sync. Composable with `github` or other SCM presets. | `GITHUB_PAT`, `GITHUB_ORG`, `GITHUB_AUTH_CLIENT_ID`, `GITHUB_AUTH_CLIENT_SECRET` |
| [`gitlab.yaml`](./gitlab.yaml) | GitLab OAuth + catalog provider | `GITLAB_HOST`, `GITLAB_AUTH_CLIENT_ID`, `GITLAB_AUTH_CLIENT_SECRET`, `GITLAB_TOKEN`, `GITLAB_GROUP` |
| [`azure.yaml`](./azure.yaml) | Azure DevOps-as-SCM: catalog + scaffolder + pipelines UI | `AZURE_DEVOPS_TOKEN`, `AZURE_DEVOPS_HOST`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT` |
| [`azure-auth.yaml`](./azure-auth.yaml) | Microsoft (Entra ID) OAuth sign-in + msgraphOrg user sync. Composable with `azure` or other SCM presets. | `AZURE_AUTH_TENANT_ID`, `AZURE_AUTH_CLIENT_ID`, `AZURE_AUTH_CLIENT_SECRET` |
| [`keycloak.yaml`](./keycloak.yaml) | Keycloak/OIDC auth + user-group sync | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `AUTH_SESSION_SECRET` |
| [`ldap.yaml`](./ldap.yaml) | LDAP auth + user-group sync (OpenLDAP defaults) | `LDAP_URL`, `LDAP_DN`, `LDAP_SECRET`, `LDAP_USERS_BASE_DN`, `LDAP_GROUPS_BASE_DN` |
| [`ldap-ad.yaml`](./ldap-ad.yaml) | Active Directory overrides for `ldap` (sAMAccountName, AD object classes). Must compose with `ldap`: `VEECODE_PRESETS=ldap,ldap-ad`. | none (reuses `ldap`'s vars) |
| [`jenkins.yaml`](./jenkins.yaml) | Jenkins CI tab on entity pages | `JENKINS_URL`, `JENKINS_USERNAME`, `JENKINS_TOKEN` |
| [`kubernetes.yaml`](./kubernetes.yaml) | Kubernetes workloads tab on entity pages | `K8S_CLUSTER_NAME`, `K8S_CLUSTER_URL`, `K8S_CLUSTER_TOKEN` |
| [`sonarqube.yaml`](./sonarqube.yaml) | SonarQube code quality tab + scaffolder action | `SONARQUBE_BASE_URL`, `SONARQUBE_API_KEY` |
| [`mcp.yaml`](./mcp.yaml) | MCP server for external clients (Claude Code, Codex CLI, Cursor) via OAuth/DCR | none |
| [`mcp-chat.yaml`](./mcp-chat.yaml) | AI Chat in-portal — surfaces MCP tools via `/mcp-chat`. **Compose with `mcp`.** | `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`, `MCP_CHAT_MODEL` |

Presets compose. `VEECODE_PRESETS=recommended,github,github-auth` enables all three.
A common shape: `recommended,veecode-theme,<your-scm>,<your-auth>` covers the
out-of-box VeeCode experience plus the customer's SCM and identity.

**SCM/identity orthogonality.** The catalog separates "SCM" presets (`github`,
`gitlab`, `azure` — repo discovery + scaffolder + integration UI) from
"identity" presets (`github-auth`, `keycloak`, `ldap`, `azure-auth` — OAuth
sign-in + user/group sync). Compose one of each, and they can be the same
provider (`github,github-auth`) or different (`gitlab,keycloak`). `gitlab` and
`keycloak` are exceptions that bundle both axes for historical reasons.

**Documented composition dependencies** — pairs where one preset requires another
(today's convention is documentation-only; if this list grows beyond two pairs,
ADR-010 calls for adding `requires.presets:` to the schema):

- `mcp-chat` requires `mcp` — chat backend loopbacks to `mcp-actions-backend`.
  `VEECODE_PRESETS=mcp,mcp-chat`. `mcp` alone exposes MCP to external CLI clients.
- `ldap-ad` requires `ldap` — AD overrides the OpenLDAP defaults in `ldap`.
  `VEECODE_PRESETS=ldap,ldap-ad` (in that order; later --config files win).

**Mutually exclusive groups** — some presets declare an `exclusive_group` field. The
resolver fails fast (exit 78) if two selected presets share the same group value, before
any preset config is applied. Currently the only defined group is `identity`, shared by
`github-auth`, `azure-auth`, `gitlab`, `keycloak`, and `ldap`. Selecting more than one
is always wrong — only one `signInPage` and one primary auth provider can be active at
boot.

## Two primary paths of use

This image supports **two equally first-class** operator paths — preset is
sugar over the same underlying mechanism, not a replacement for raw Backstage
configuration:

1. **Preset path (shortcut)** — `VEECODE_PRESETS=recommended,github` plus the
   required env vars. The entrypoint turns each preset into a
   `preset-<name>-plugins.yaml` file and an `app-config.preset-<name>.yaml`,
   adds the plugin file to the list of plugin files loaded at boot, and adds
   each app-config as a `--config` flag. Use this when your stack matches one
   of the catalog entries.

2. **Raw Backstage path** — leave `VEECODE_PRESETS` unset and mount your own
   `app-config.yaml`, a `dynamic-plugins.yaml` with `plugins:` entries, and
   overrides via volume. Internally the image's load order still applies, and
   the full plugin list is still assembled by the entrypoint at boot.
   Use this when you need something a preset doesn't cover, or when you already
   have a Helm chart that produces these files.

The two paths layer naturally: an operator's `app-config.local.yaml` always wins
over preset configs (see the precedence table in `entrypoint.sh`).

## Composition rules — read carefully

Presets compose by being listed in `VEECODE_PRESETS=a,b,c`. The composition
happens at runtime in `install-dynamic-plugins.py` and `entrypoint.sh`, NOT via
preset inheritance (presets are flat — no `extends:` keyword).

- **Plugins**: each preset's `plugins:` block is written to its own
  `preset-<name>-plugins.yaml` file and added to the list of plugin files
  loaded at boot. `install-dynamic-plugins.py` then loads each file and
  merges per `package` key — **shallow merge, last-write-wins on the entry as a whole**.
  Caveat: the `package:` field must match the entry already present in
  `dynamic-plugins.default.yaml` exactly. A mismatch installs the plugin a
  second time under a different name and the backend crashes on the duplicate
  registration. See the comments in `presets/recommended.yaml` for the
  contract.
- **`appConfig`**: each preset's `appConfig:` block is written to its own
  `app-config.preset-<name>.yaml` and added to the backend's `--config` list, in
  preset order. Backstage's config loader deep-merges `--config` files
  natively, so two presets that touch the same key path merge under standard
  Backstage rules (object merges, scalar last-wins).
- **`requires.variables`**: unioned across presets. A variable required by any
  preset is required overall, and the resolver exits 78 with a combined
  error message listing every missing var before the backend starts.

## Adding a new preset

1. Copy [`recommended.yaml`](./recommended.yaml) as a starting point.
2. Pick a unique `name` and a clear `description`.
3. List the plugins your stack needs in `plugins`. Use OCI references
   when possible.
4. Declare every env var your plugins need in `requires.variables`.
   Mark as `required: true` if the plugin fails without it.
5. Provide the `appConfig` block that wires plugins to those vars.
6. Test locally: `VEECODE_PRESETS=<your-preset> docker run ...`

A preset must be self-contained. If it depends on another preset
implicitly (e.g., your GitHub preset assumes the marketplace is enabled),
either declare that dependency explicitly or roll the assumed plugins
into your own preset.

## Discipline

- Presets are configuration, not features. New plugins go in the
  `dynamic-plugins-store` (or as OCI artifacts); presets reference them.
- Keep the preset count small. If the catalog grows beyond ~6, the
  curation is leaking — consider whether some presets are really
  customer-specific and belong in their own deployment, not in the
  shipped catalog.
- Variables follow per-preset namespaces (`GITHUB_*` for GitHub preset,
  `AZURE_*` for Azure). Platform-wide variables (DB connection, base URL)
  live outside presets.
