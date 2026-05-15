# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

VeeCode DevPortal is an open-source Backstage distribution designed for production use. It provides a minimal, extensible foundation with dynamic plugin loading capabilities. This is **not** a fork of RHDH but draws inspiration and patterns from Red Hat Developer Hub.

**Key characteristics:**

- Yarn 4 monorepo with workspaces (always try to use the same yarn version, latest stable)
- Frontend app: packages/app folder
- Backend app: packages/backend folder
- Internal static plugins: plugins/\* folders
- Static plugins: the ones imported in packages.json (backend plugins in Backend app, frontend plugins in Frontend app)
- Dynamic plugin architecture replicated from RHDH (using Scalprum)
- Node.js 20 or above required

## Understanding the codebase

- docs/PROJECT_CONTEXT.md - What this image is, two paths of use, how it differs from devportal-base/distro
- docs/MONOREPO_STRUCTURE.md - Yarn 4 root workspace + the separate `dynamic-plugins/` Yarn project
- docs/DEVELOPMENT_GUIDE.md - Local dev: `yarn dev-local` (Node loop) vs `scripts/dev-run.sh` (image overlay)
- docs/DOCKER_DEVELOPMENT.md - Unified image build, build-args, the `cbme` stopgap
- docs/BACKSTAGE_ARCHITECTURE.md - Pinned versions (1.49.4) + how the static + dynamic backend wire together
- docs/DYNAMIC_PLUGINS_ARCHITECTURE.md - Scalprum + MF runtime; rhdh-cli vs janus-cli; authoring gotchas
- docs/PLUGINS.md - Static + internal + dynamic plugin inventory; what each preset enables
- docs/CONFIGURATION_GUIDE.md - Preset path + raw Backstage path; app-config layering at boot
- docs/DYNAMIC_PLUGIN_TRANSLATIONS.md - i18n in dynamic plugins; en + pt locales today
- docs/RBAC.md - Shipped admin/developer/viewer policy; per-deploy overrides via RBAC_POLICY_PATH
- docs/UPGRADING.md - Three independent tracks: Backstage / UBI / EXTENSIONS_TAG
- docs/RELEASE_CYCLE.md - Manual-dispatch publish workflow; multi-arch manifest
- docs/SECURITY_SCAN_AND_FIX.md - Trivy + Claude Code agent CI; manual scan path
- docs/MUI_MIGRATION_STATUS.md - On MUI v5 from day one; small @mui/styles makeStyles residue
- docs/ROADMAP_FEATURES.md - What's planned (more presets, MCP preset, 1.50 bump, NFS)
- docs/ROADMAP_BACKLOG.md - Known tech debt and gotchas to clean up
- docs/adr/ - Architecture Decision Records:
  - ADR-011: Frontend design system — VeeCode theme as a dynamic plugin and a preset
  - ADR-012: Pull UBI from the anonymous mirror (`registry.access.redhat.com`)
- presets/README.md + presets/SCHEMA.md - The preset model itself (tiers, requires.variables, composition)

## Known Issues

Testing coverage is low due to migration to DevPortal Base repository. See Testing Strategy below.

## Common Commands

### Initial Setup

```bash
make full && yarn check-dynamic-plugins   # Or: yarn init-local
```

### Development

```bash
yarn dev-local                            # Start with local config (app-config.local.yaml)
yarn dev                                  # Start with base config only
LOG_LEVEL=debug yarn dev-local            # With debug logging
yarn debug-local                          # With Node.js inspector enabled
```

### Building

```bash
yarn build                                # Build all packages (turbo)
yarn build:backend                        # Build backend only
yarn tsc                                  # TypeScript check all packages
```

### Testing

```bash
yarn test                                 # Run tests (turbo)
yarn test:all                             # Run all tests with coverage
yarn test:e2e                             # Run Playwright e2e tests
```

### Linting

```bash
yarn lint:check                           # Check linting (turbo)
yarn lint:fix                             # Fix linting issues (turbo)
yarn prettier:check                       # Check formatting
```

### Single Package Operations

```bash
yarn workspace backend test               # Test backend package
yarn workspace app build                  # Build app package
yarn workspace @internal/plugin-dynamic-plugins-info test
```

### Dynamic Plugins

Dynamic plugins are fetched as OCI bundles at boot by `docker/install-dynamic-plugins.py`. The legacy host-side `dynamic-plugins/` workspace is gone — there is no `yarn build && yarn export-dynamic && yarn copy-dynamic-plugins` step anymore. The complete plugin inventory lives in `dynamic-plugins.default.yaml` (with `oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>` refs), and presets flip `disabled: false` to turn entries on.

For local-overlay editing of plugin bundles, run `./scripts/dev-run.sh dp-extract` to copy the image's `/app/dynamic-plugins-root/` into `.devrun-cache/dynamic-plugins-root/`, edit in place, then `./scripts/dev-run.sh run` to mount it back over the image — no rebuild. See [`docs/DEVELOPMENT_GUIDE.md`](docs/DEVELOPMENT_GUIDE.md) § "Image overlay loop".

## Architecture

### Monorepo Structure

```pre
packages/
  app/           # Frontend application (Scalprum-based dynamic shell)
  backend/       # Backend server with static plugins
  plugin-utils/  # Shared utilities

plugins/         # Internal plugins (workspace packages)
  dynamic-plugins-info/          # Frontend plugin for viewing loaded plugins
  dynamic-plugins-info-backend/  # Backend API for plugin info
  scalprum-backend/              # Backend support for dynamic frontend loading

dynamic-plugins/                 # Build workspace for preinstalled plugins
  wrappers/      # Compatibility wrappers for legacy static plugins
  downloads/     # Native dynamic plugins (defined in plugins.json)
  _utils/        # Build utilities

dynamic-plugins-root/            # Runtime directory for loaded dynamic plugins
```

### Plugin Types

1. **Static Plugins**: Compiled into the application bundle (backend: auth providers, catalog, scaffolder, permissions, RBAC; frontend: minimal core)

2. **Dynamic Plugins**: Loaded at runtime from `dynamic-plugins-root/` directory

   - **Preinstalled**: Baked into image, optionally enabled via config
   - **Downloaded**: Fetched from registries at startup

3. **Internal Plugins** (`@internal/*`): Workspace packages in `plugins/` directory

### Frontend Architecture

The frontend uses Scalprum for dynamic plugin loading instead of standard Backstage routing. Key files:

- `packages/app/src/App.tsx` - Root component with ScalprumRoot
- `packages/app/src/components/DynamicRoot/` - Dynamic plugin mounting infrastructure
- `packages/app/src/apis.ts` - API factories

Dynamic plugins builds (frontend or backend) use `janus-cli` or its more recent version `rhdh-cli`.

### Backend Architecture

The backend (`packages/backend/src/index.ts`) initializes:

1. Default service factories with custom logging
2. Dynamic plugin feature loader with custom module resolution for wrapper packages
3. Static plugins (catalog, auth, scaffolder, permissions, search, etc.)
4. Internal plugins (dynamic-plugins-info-backend, scalprum-backend)

### Configuration Files

- `app-config.yaml` - Base configuration (guest auth, local SQLite)
- `app-config.production.yaml` - Container/production paths
- `app-config.dynamic-plugins.yaml` - Dynamic plugin configurations
- `app-config.local.yaml` - Local developer overrides (gitignored)

### Configuration Presets

This repo uses **presets**, not profiles. There is no `VEECODE_PROFILE` system. Presets are versioned, composable YAML files in [`presets/`](presets/) selected at runtime via `VEECODE_PRESETS=a,b,c`. They declare required env vars, the plugins they enable, and the app-config they layer in. See [`presets/README.md`](presets/README.md) and [`presets/SCHEMA.md`](presets/SCHEMA.md).

**Available presets** (set via `VEECODE_PRESETS`, comma-separated):

| Preset          | Purpose                                                           |
| --------------- | ----------------------------------------------------------------- |
| `recommended`   | Curated baseline (marketplace, RBAC, tech-radar, pending-changes) |
| `veecode-theme` | VeeCode brand theme (palette + logos)                             |
| `github`        | GitHub OAuth + catalog provider + integration                     |
| `gitlab`        | GitLab OAuth + catalog provider                                   |
| `azure`         | Azure DevOps catalog + scaffolder + pipelines UI                  |
| `keycloak`      | Keycloak/OIDC auth + user-group sync                              |
| `ldap`          | LDAP auth + user-group sync                                       |
| `jenkins`       | Jenkins CI tab                                                    |
| `kubernetes`    | Kubernetes workloads tab                                          |
| `sonarqube`     | SonarQube code-quality tab + scaffolder action                    |

Presets compose. Typical usage: `VEECODE_PRESETS=recommended,veecode-theme,github` plus the env vars each declares as `required: true` (e.g. `GITHUB_PAT`, `GITHUB_ORG`). Required env vars are validated at boot; missing ones fail fast with exit 78. See [`docs/CONFIGURATION_GUIDE.md`](docs/CONFIGURATION_GUIDE.md) for the full layering.

**Adding a new preset:** see [`presets/README.md`](presets/README.md) § "Adding a new preset" and the schema in [`presets/SCHEMA.md`](presets/SCHEMA.md).

## Tech Docs Setup

For local TechDocs generation:

```bash
python3 -m venv $(pwd)/venv
source venv/bin/activate
pip install -r python/requirements.txt
```

Keep the venv activated when running DevPortal.

## Default Ports

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:7007`

## Testing Backend APIs

This is very important: testing backend APIs directly is an excellent way to investigate issues and to build automated backend tests.

```bash
# Get user token via guest auth
USER_TOKEN="$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.backstageIdentity.token')"

# Use token for API calls
curl -H "Authorization: Bearer $USER_TOKEN" http://localhost:7007/api/catalog/entities
```

## Testing Strategy

**Principle: Test as you go, don't stop to backfill.**

Testing improves organically alongside feature work. No dedicated "testing sprints" that block delivery.

### Rules for when to write tests

| Situation                   | Action              |
| --------------------------- | ------------------- |
| Writing new code            | Add unit test       |
| Fixing a bug                | Add regression test |
| Refactoring old code        | Add test first      |
| Just reading/using old code | Leave it alone      |

### Priority areas (when you have time)

1. **Backend APIs** - Easy to test, high value
2. **Internal plugins** (`plugins/*`) - Isolated, testable units
3. **Shared utilities** (`packages/plugin-utils`)

### Skip for now

- Complex frontend component tests (DynamicRoot, Scalprum integration)
- E2E tests (high maintenance cost)

## Browser Automation

**Prefer `agent-browser` over Puppeteer MCP tools** for web automation. It provides cleaner element discovery with refs (`@e1`, `@e2`) instead of CSS selectors, avoiding selector failures and custom JavaScript workarounds.

Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

### CI enforcement

- PR checks run `yarn test` - prevents new regressions
- Pre-commit hooks catch issues early

## Git Workflow

**Trunk-based development with short-lived branches.**

### Rules

1. **Never push directly to main** - Always use feature branches and PRs
2. **Keep branches short-lived** - Hours to days, not weeks
3. **Wait for CI** - `validate` check must pass before merge
4. **Squash merge** - Keep main history clean
5. **Delete branch after merge** - No stale branches

### Workflow

```bash
# 1. Create feature branch
git checkout -b feat/my-feature

# 2. Make changes and commit
git add .
git commit -m "Add my feature"

# 3. Push and create PR
git push -u origin feat/my-feature
gh pr create --fill

# 4. Wait for CI, then merge
gh pr merge --squash --delete-branch

# 5. Update local main
git checkout main && git pull
```

### Branch Naming

- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `refactor/` - Code refactoring
- `chore/` - Maintenance tasks

### Exceptions

Direct push to main (bypassing branch protection) is allowed for:

**Low-risk changes:**

- Pure documentation changes (markdown files, comments only)
- ADR additions or updates
- CLAUDE.md updates

**Emergencies only:**

- Critical security fixes that can't wait for CI
- CI pipeline fixes when PR checks are broken

For emergencies, document the reason in the commit message.
