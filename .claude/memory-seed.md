# Memory MCP Seed Data

This file contains key project facts to store in Memory MCP after restart.
Use these to populate the knowledge graph with `create_entities`, `create_relations`, and `add_observations`.

## Entities to Create

### Project Identity

```json
{
  "name": "VeeCode DevPortal",
  "entityType": "project",
  "observations": [
    "Open-source Backstage distribution for production use",
    "Not a fork of RHDH but inspired by Red Hat Developer Hub patterns",
    "Provides minimal, extensible foundation with dynamic plugin loading",
    "Repository: veecode-platform/devportal-base",
    "License: Apache-2.0"
  ]
}
```

### Technology Stack

```json
{
  "name": "Tech Stack",
  "entityType": "technology",
  "observations": [
    "Yarn 4 monorepo with workspaces",
    "Node.js 20+ required",
    "TypeScript strict mode",
    "React 18 frontend",
    "Express backend",
    "Scalprum for dynamic plugin loading (Webpack Module Federation)",
    "Material-UI v5",
    "Turbo for build orchestration",
    "Jest 30 for testing",
    "Playwright for E2E tests"
  ]
}
```

### Monorepo Structure

```json
{
  "name": "packages/app",
  "entityType": "package",
  "observations": [
    "Frontend application",
    "Scalprum-based dynamic shell",
    "Entry point: src/App.tsx with ScalprumRoot",
    "Dynamic plugin mounting in src/components/DynamicRoot/",
    "Runs on port 3000"
  ]
}
```

```json
{
  "name": "packages/backend",
  "entityType": "package",
  "observations": [
    "Backend server",
    "Entry point: src/index.ts",
    "Loads static plugins at compile time",
    "Loads dynamic plugins at runtime via feature loader",
    "Runs on port 7007"
  ]
}
```

```json
{
  "name": "packages/plugin-utils",
  "entityType": "package",
  "observations": [
    "Shared utilities library",
    "Published as @red-hat-developer-hub/plugin-utils",
    "Common-library role in Backstage"
  ]
}
```

```json
{
  "name": "plugins/dynamic-plugins-info",
  "entityType": "internal-plugin",
  "observations": [
    "Frontend plugin for viewing loaded dynamic plugins",
    "Published as @internal/plugin-dynamic-plugins-info",
    "Shows plugin status, versions, and configuration"
  ]
}
```

```json
{
  "name": "plugins/dynamic-plugins-info-backend",
  "entityType": "internal-plugin",
  "observations": [
    "Backend API for plugin information",
    "Published as @internal/plugin-dynamic-plugins-info-backend",
    "Provides REST endpoints for plugin metadata"
  ]
}
```

```json
{
  "name": "plugins/scalprum-backend",
  "entityType": "internal-plugin",
  "observations": [
    "Backend support for dynamic frontend loading",
    "Published as @internal/plugin-scalprum-backend",
    "Serves plugin manifests and assets"
  ]
}
```

```json
{
  "name": "dynamic-plugins",
  "entityType": "directory",
  "observations": [
    "Build workspace for preinstalled plugins",
    "wrappers/ - Compatibility wrappers for legacy static plugins",
    "downloads/ - Native dynamic plugins defined in plugins.json",
    "_utils/ - Build utilities",
    "Uses janus-cli or rhdh-cli for builds"
  ]
}
```

```json
{
  "name": "dynamic-plugins-root",
  "entityType": "directory",
  "observations": [
    "Runtime directory for loaded dynamic plugins",
    "Plugins are loaded from here at startup",
    "Populated by copy-dynamic-plugins script"
  ]
}
```

### Plugin Architecture

```json
{
  "name": "Static Plugins",
  "entityType": "concept",
  "observations": [
    "Compiled into application bundle at build time",
    "Backend: auth providers, catalog, scaffolder, permissions, RBAC",
    "Frontend: minimal core only",
    "Defined in package.json dependencies"
  ]
}
```

```json
{
  "name": "Dynamic Plugins",
  "entityType": "concept",
  "observations": [
    "Loaded at runtime from dynamic-plugins-root/ directory",
    "Use Webpack Module Federation via Scalprum",
    "Two types: Preinstalled (baked into image) and Downloaded (fetched at startup)",
    "Configured in app-config.dynamic-plugins.yaml",
    "Built with janus-cli or rhdh-cli"
  ]
}
```

```json
{
  "name": "Internal Plugins",
  "entityType": "concept",
  "observations": [
    "Workspace packages in plugins/ directory",
    "Scoped under @internal/*",
    "Part of monorepo, developed alongside core",
    "Examples: dynamic-plugins-info, scalprum-backend"
  ]
}
```

### Configuration

```json
{
  "name": "Configuration System",
  "entityType": "concept",
  "observations": [
    "app-config.yaml - Base configuration (guest auth, local SQLite)",
    "app-config.dynamic-plugins.yaml - Dynamic plugin configurations",
    "app-config.local.yaml - Local overrides (gitignored, for secrets)",
    "app-config.github.yaml - GitHub auth profile",
    "app-config.keycloak.yaml - Keycloak auth profile",
    "app-config.azure.yaml - Azure AD auth profile",
    "app-config.production.yaml - Container/production paths",
    "Profile selection via VEECODE_PROFILE env var: github, keycloak, azure, local"
  ]
}
```

### Development Workflow

```json
{
  "name": "Git Workflow",
  "entityType": "workflow",
  "observations": [
    "Trunk-based development with short-lived branches",
    "Never push directly to main except for docs-only changes",
    "Branch naming: feat/, fix/, docs/, refactor/, chore/",
    "Squash merge to keep history clean",
    "Delete branch after merge",
    "CI check 'validate' must pass before merge"
  ]
}
```

```json
{
  "name": "Testing Strategy",
  "entityType": "workflow",
  "observations": [
    "Principle: Test as you go, don't stop to backfill",
    "New code: Add unit test",
    "Bug fix: Add regression test",
    "Refactoring: Add test first",
    "Priority areas: Backend APIs, internal plugins, shared utilities",
    "Skip for now: Complex frontend tests, E2E tests",
    "Jest uses --watchAll=false for Turbo compatibility"
  ]
}
```

### Key Commands

```json
{
  "name": "Common Commands",
  "entityType": "reference",
  "observations": [
    "Initial setup: make full && yarn check-dynamic-plugins",
    "Development: yarn dev-local (uses app-config.local.yaml)",
    "Build all: yarn build (uses Turbo)",
    "Test all: yarn test (uses Turbo)",
    "Single package: yarn workspace <name> <command>",
    "Debug mode: yarn debug-local (Node.js inspector)",
    "Backend API token: curl POST to /api/auth/guest/refresh"
  ]
}
```

### Architecture Decisions

```json
{
  "name": "ADR-001",
  "entityType": "adr",
  "observations": [
    "Title: Scalprum for Dynamic Plugin Loading",
    "Status: Accepted",
    "Uses Webpack Module Federation via Scalprum",
    "Enables runtime plugin loading without rebuilding shell",
    "Tradeoff: Added complexity for flexibility"
  ]
}
```

```json
{
  "name": "ADR-002",
  "entityType": "adr",
  "observations": [
    "Title: Base Image vs Distribution Image",
    "Status: Accepted",
    "Base image: minimal, used for custom distributions",
    "Distro image: batteries-included, ready-to-use",
    "Enables both customization and quick-start paths"
  ]
}
```

```json
{
  "name": "ADR-003",
  "entityType": "adr",
  "observations": [
    "Title: UBI9 Node.js Base Image",
    "Status: Accepted",
    "Uses Red Hat Universal Base Image 9",
    "Enterprise-grade security and support",
    "Compatible with OpenShift deployment"
  ]
}
```

```json
{
  "name": "ADR-004",
  "entityType": "adr",
  "observations": [
    "Title: Static vs Dynamic Plugin Classification",
    "Status: Accepted",
    "Static: core functionality, auth providers, permissions",
    "Dynamic: optional features, third-party integrations",
    "Classification based on criticality and change frequency"
  ]
}
```

```json
{
  "name": "ADR-005",
  "entityType": "adr",
  "observations": [
    "Title: Testing Strategy",
    "Status: Accepted",
    "Test as you go, don't block feature delivery",
    "Priority: Backend APIs > Internal plugins > Utilities",
    "No dedicated testing sprints"
  ]
}
```

```json
{
  "name": "ADR-006",
  "entityType": "adr",
  "observations": [
    "Title: Yarn 4 Workspaces",
    "Status: Accepted",
    "Monorepo management with Yarn 4",
    "PnP disabled for Backstage compatibility",
    "Turbo for build orchestration"
  ]
}
```

```json
{
  "name": "ADR-007",
  "entityType": "adr",
  "observations": [
    "Title: Jest --watchAll=false",
    "Status: Accepted",
    "Required for Turbo compatibility",
    "Turbo doesn't forward stdin to child processes",
    "Jest defaults to watch mode which hangs without stdin"
  ]
}
```

```json
{
  "name": "ADR-008",
  "entityType": "adr",
  "observations": [
    "Title: Trunk-Based Development",
    "Status: Accepted",
    "Short-lived feature branches",
    "Squash merge to main",
    "Docs-only changes can bypass PR requirement"
  ]
}
```

### Known Issues

```json
{
  "name": "Known Issues",
  "entityType": "reference",
  "observations": [
    "App.test.tsx skipped: top-level await incompatible with Jest/CJS transform",
    "DynamicRoot.test.tsx skipped: complex Scalprum integration",
    "Some tests have React Router deprecation warnings (v7 migration needed)",
    "MSW v1 patterns in some tests (mostly migrated to v2)",
    "48 Dependabot vulnerabilities on default branch"
  ]
}
```

## Relations to Create

```json
[
  { "from": "VeeCode DevPortal", "to": "Tech Stack", "relationType": "uses" },
  {
    "from": "VeeCode DevPortal",
    "to": "packages/app",
    "relationType": "contains"
  },
  {
    "from": "VeeCode DevPortal",
    "to": "packages/backend",
    "relationType": "contains"
  },
  {
    "from": "VeeCode DevPortal",
    "to": "packages/plugin-utils",
    "relationType": "contains"
  },
  { "from": "packages/app", "to": "Dynamic Plugins", "relationType": "loads" },
  {
    "from": "packages/backend",
    "to": "Static Plugins",
    "relationType": "loads"
  },
  {
    "from": "packages/backend",
    "to": "Dynamic Plugins",
    "relationType": "loads"
  },
  {
    "from": "Dynamic Plugins",
    "to": "dynamic-plugins-root",
    "relationType": "stored_in"
  },
  {
    "from": "plugins/dynamic-plugins-info",
    "to": "Internal Plugins",
    "relationType": "is_type"
  },
  {
    "from": "plugins/dynamic-plugins-info-backend",
    "to": "Internal Plugins",
    "relationType": "is_type"
  },
  {
    "from": "plugins/scalprum-backend",
    "to": "Internal Plugins",
    "relationType": "is_type"
  },
  { "from": "Git Workflow", "to": "ADR-008", "relationType": "documented_in" },
  {
    "from": "Testing Strategy",
    "to": "ADR-005",
    "relationType": "documented_in"
  },
  { "from": "ADR-007", "to": "Testing Strategy", "relationType": "supports" }
]
```

## Usage After Restart

After restarting Claude Code, use the memory tools like this:

```
# Store an entity
mcp__memory__create_entities with entities array

# Create relations
mcp__memory__create_relations with relations array

# Search knowledge
mcp__memory__search_nodes with query string

# Add observations to existing entity
mcp__memory__add_observations with entityName and observations array
```
