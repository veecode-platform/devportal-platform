---
name: presets
description: Composable YAML contracts selected at runtime (VEECODE_PRESETS) that turn the generic image into a working IDP for a specific stack.
type: topic
audience: [operator, plugin-author]
related: [dynamic-plugins, configuration-layering, preset-schema, shipped-presets]
---

# Presets

## What this is

A preset is a versioned YAML file in `presets/<name>.yaml` that declares
three things: the environment variables the operator must supply
(`requires.variables`), the dynamic plugins the situation needs (`plugins:`
— as OCI references), and the `app-config` block those plugins expect
(`appConfig:`). Presets are selected at runtime via the `VEECODE_PRESETS`
environment variable, which accepts a comma-separated list of names:
`VEECODE_PRESETS=recommended,veecode-theme,github`. The entrypoint resolves
each listed preset before Backstage starts; missing required vars cause exit
78 with a named error before the backend boots.

The image supports two equally valid operator paths. The **preset path** —
`VEECODE_PRESETS=a,b,c` plus the required env vars — writes each preset's
`plugins:` and `appConfig:` blocks into their own files, then loads the plugin
files at boot and passes the app-configs to Backstage as `--config` flags. The **raw Backstage path** leaves `VEECODE_PRESETS` unset and has the
operator mount their own `app-config.yaml`, a `dynamic-plugins.yaml` containing
top-level `plugins:` entries, and any overlays. The two paths layer: an operator-mounted
`app-config.local.yaml` always wins over preset-generated configs regardless
of which path initiated the boot. The deep-merge order is covered in the
[`configuration-layering`](configuration-layering.md) topic; for now the
precedence can also be read from `entrypoint.sh` directly.

## Tiers

Plugins in the image fall into exactly three tiers. The tier determines
where a plugin lives and what gate controls it.

### Core

Always on, baked into the image, not gated by any preset. Examples: the
global header (search bar, notifications, profile dropdown), the homepage,
the About page and its backend API, `dynamic-plugins-info` (the page and
backend that list what loaded at boot).

**Admission test**: the app is not usable without it *and* it needs zero
configuration to function.

If a plugin passes the second half of the test but fails the first —
"technically works with no config, but nobody would miss it" — it belongs in
`recommended`, not core. Core is not a catch-all for low-config plugins.

### `recommended`

Enabled by `VEECODE_PRESETS=recommended`. Includes: the DevPortal
marketplace (frontend + backend + the catalog-backend extension that ingests
the plugin catalog index), pending-changes widget, tech-radar with a sample
dataset marked explicitly as a sample, and the RBAC UI (enforcement is
already on by default via `permission.enabled: true`; the UI makes RBAC
visible to admins without requiring a policy CSV).

**Admission test**: works with zero configuration *and* makes the image read
as a DevPortal rather than a Backstage skeleton.

A plugin that loads but renders empty or broken without config does not
belong in `recommended`. An empty page in the out-of-the-box experience is
worse than an absent one.

### Integration presets

Enabled only when selected. Each requires customer-specific configuration
and carries `requires.variables`. The 14 shipped integration presets are:

| Preset | What it adds |
|---|---|
| `veecode-theme` | VeeCode brand palette and logos |
| `github` | GitHub-as-SCM: catalog provider, integration, Actions UI tab |
| `github-auth` | GitHub-as-identity: OAuth sign-in + org/team user sync. Compose with `github` for the full GitHub stack |
| `gitlab` | GitLab OAuth, catalog provider |
| `azure` | Azure DevOps-as-SCM: catalog, scaffolder, pipelines UI tab |
| `azure-auth` | Microsoft (Entra ID) OAuth sign-in + msgraphOrg user sync. Compose with `azure` for the full Microsoft stack |
| `keycloak` | Keycloak/OIDC auth, user-group sync |
| `ldap` | LDAP auth, user-group sync (OpenLDAP defaults) |
| `ldap-ad` | Active Directory overrides for `ldap` (sAMAccountName, AD object classes). Compose with `ldap` |
| `jenkins` | Jenkins CI tab on entity pages |
| `kubernetes` | Kubernetes workloads tab on entity pages |
| `sonarqube` | SonarQube code-quality tab, scaffolder action |
| `mcp` | MCP server for external CLI clients via OAuth/DCR |
| `mcp-chat` | In-portal AI chat via `/mcp-chat`; compose with `mcp` |

**Admission test**: integrates with something customer-specific and
therefore requires at least one `requires.variables` entry.

`veecode-theme` and `mcp` are exceptions within this tier: `veecode-theme`
has no required vars (brand is not integration), and `mcp` has none either
(its OAuth/DCR config lives in the platform's `app-config.production.yaml`).
They still belong in the integration tier because they are optional and
deployment-specific, not universal chrome.

## How composition works at runtime

`VEECODE_PRESETS=a,b,c` triggers the preset resolver in `entrypoint.sh`.
The resolver runs three steps per preset, in order, before the backend
starts:

**1. Variable validation** (`entrypoint.sh`)

For each `requires.variables` entry marked `required: true`, the resolver
checks whether the variable is set in the environment. It accumulates all
missing vars across all selected presets before printing the combined error
and exiting 78. This means a single boot attempt surfaces every missing var
for the full preset list, not just the first one.

```
ERROR: the selected preset(s) require variables that are not set:
  - Preset "github" requires GITHUB_PAT. Personal Access Token ...
  - Preset "keycloak" requires KEYCLOAK_CLIENT_SECRET. ...
Set them via the environment or $VEECODE_APP_CONFIG and restart.
```

**2. Plugin fragment** (`entrypoint.sh`)

If the preset's `plugins:` list is non-empty, the resolver writes:

```
/app/preset-<name>-plugins.yaml   →  { plugins: [...] }
```

That file is added to the list of plugin files loaded at boot, before
`install-dynamic-plugins.py` runs.
The Python script merges each included fragment shallow per `package:` key — the entry in
`dynamic-plugins.default.yaml` is the authoritative record; the preset
fragment flips `disabled: false` (and optionally sets
`pluginConfig`). The `package:` value must match exactly; a mismatch
installs the plugin a second time and the backend crashes on duplicate
registration.

**3. App-config fragment** (`entrypoint.sh`)

If the preset's `appConfig:` block is non-empty, the resolver writes:

```
/app/app-config.preset-<name>.yaml   →  contents of appConfig:
```

That file is appended to the backend's `--config` argument list.
Backstage's config loader deep-merges `--config` files natively: object
keys merge recursively, scalar keys are last-write-wins in preset order.
No manual merge logic runs.

After all presets are processed, the assembled list of plugin files
looks like:

```
[dynamic-plugins.default.resolved.yaml, /app/data/extensions-install.yaml,
 preset-recommended-plugins.yaml, preset-github-plugins.yaml]
```

`entrypoint.sh` writes this with `yq eval -i` so a `docker
restart` that re-runs the entrypoint is idempotent.

## The curation boundary

`requires.variables` is the boundary between what presets carry and what
they refuse to carry. A preset that declares a required variable is saying:
from this point on, the configuration is customer-specific; here is *what*
you need and where the docs are, but you supply the values.

Three rules follow from that:

**No business logic.** A preset must not ship an opinionated RBAC policy
CSV, catalog rules that assume a particular org structure, or scaffolder
templates. Those are per-customer implementation artifacts. They belong in
that customer's deployment repository, not in the shipped catalog. Sample
data clearly marked as a sample to be replaced — the starter tech-radar in
`recommended`, for instance — is not business logic and is allowed.

**`recommended` must look polished with zero config and do nothing real
without it.** On first boot: chrome works, the homepage renders, the
marketplace is browsable, About shows the version string. The moment the
operator wants the IDP to integrate a repository, enforce RBAC, or run a
scaffolder template, they hit a `requires.variables` wall that names what
is missing and points at the docs. That wall is intentional; it surfaces
required setup up front rather than as a runtime error in production.

**One-line summary**: "A preset carries the configuration that is the same
for everyone and stops at the configuration that is specific to one customer
— it is a map of the work, not the work done."
(See `presets/README.md` § "The curation boundary" and
`docs/adr/010-unified-image-and-presets.md` § "Preset tiers and the
curation boundary".)

## Picking presets for your situation

Three representative combinations with the actual env vars they require:

### `recommended,veecode-theme` — out-of-box VeeCode look

```sh
docker run -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme \
  docker.io/veecode/devportal-platform:latest
```

No required vars. This is the evaluation starting point: VeeCode brand
palette, marketplace, tech-radar, RBAC UI, pending-changes widget.

### `recommended,veecode-theme,github` — GitHub-integrated stack

```sh
docker run -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme,github \
  -e GITHUB_PAT=ghp_xxxx \
  -e GITHUB_ORG=my-org \
  docker.io/veecode/devportal-platform:latest
```

Required vars: `GITHUB_PAT` (scope: `repo`, `read:org`), `GITHUB_ORG`.
The `github` preset wires a catalog provider that scans `catalog-info.yaml`
files in `GITHUB_ORG`, the GitHub SCM integration, and the GitHub Actions
UI tab. It does **not** wire the GitHub OAuth sign-in provider —
operators add that block via `app-config.local.yaml` (see
`presets/github.yaml` header comment).

### `recommended,keycloak` — Keycloak/OIDC-authenticated stack

```sh
docker run -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,keycloak \
  -e KEYCLOAK_BASE_URL=https://keycloak.internal \
  -e KEYCLOAK_REALM=devportal \
  -e KEYCLOAK_CLIENT_ID=devportal \
  -e KEYCLOAK_CLIENT_SECRET=xxx \
  -e AUTH_SESSION_SECRET=xxx \
  docker.io/veecode/devportal-platform:latest
```

Required vars: `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`,
`KEYCLOAK_CLIENT_SECRET`, `AUTH_SESSION_SECRET`.
(Source: `presets/keycloak.yaml` § `requires.variables`.)

### `mcp,mcp-chat` — AI integration pair

The only preset pair with a documented composition dependency: `mcp-chat`
talks loopback to `mcp-actions-backend`, so it only works as
`VEECODE_PRESETS=mcp,mcp-chat`. `mcp` alone exposes the MCP server to
external CLI clients (Claude Code, Codex CLI, Cursor) without enabling
in-portal chat — no LLM API key required. `mcp-chat` adds the in-portal
`/mcp-chat` route and requires `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`,
and `MCP_CHAT_MODEL`.
(Source: `presets/mcp-chat.yaml` § `requires.variables`.)

## Going further

- **[`shipped-presets`](../reference/shipped-presets.md)** — full table
  of every preset with its required vars, description, and plugin list.
- **[`preset-schema`](../reference/preset-schema.md)** — complete YAML
  format spec for the preset file itself.
- **[`presets/README.md`](../../presets/README.md) § "Adding a new
  preset"** — step-by-step guide to authoring a new preset and the
  discipline rules for keeping the catalog small.
