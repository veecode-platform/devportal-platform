# Fleet inventory — OFS → NFS

Status: scope snapshot captured; source/config scan started; full census not started

This inventory separates what the source package can do from what the published
artifact has actually proved in the NFS runtime. Upstream `/alpha` presence is
not sufficient evidence for VeeCode fork readiness.

## Scope snapshot — 2026-07-29

The operational denominator is composed from the files that actually drive the
image, not from the reference vitrine:

| Scope | Source | Count | Meaning |
| --- | --- | ---: | --- |
| Core package declarations | [`dynamic-plugins.yaml`](../../../../dynamic-plugins.yaml) | 6 | Pre-installed packages enabled by the current raw deployment path |
| Optional package declarations | [`presets/`](../../../../presets/) | 21 | Unique package entries across `azure`, `github`, `jenkins`, `kubernetes`, `mcp`, `mcp-chat`, `recommended`, `sonarqube` and `veecode-theme` |
| Configuration-only presets | [`presets/`](../../../../presets/) | 6 | `azure-auth`, `github-auth`, `gitlab`, `keycloak`, `ldap` and `ldap-ad`; they change auth/catalog configuration without adding a package entry |
| Reference vitrine | [`dynamic-plugins.default.yaml`](../../../../dynamic-plugins.default.yaml) | 33 | Reference entries only; not the active fleet denominator |

This gives **27 unique declared packages** plus six configuration-only preset
surfaces. The package count is not a readiness percentage and is not the count
of frontend plugins: backend pairs, shell packages and config-only capabilities
must remain distinguishable in the detailed inventory.

### Declared package groups

The current 27-package scope is:

| Source group | Package members |
| --- | --- |
| Core | `veecode-platform-plugin-veecode-homepage-dynamic`; `veecode-platform-plugin-veecode-global-header-dynamic`; `veecode-platform-backstage-plugin-about-dynamic`; `veecode-platform-backstage-plugin-about-backend-dynamic`; `internal-plugin-dynamic-plugins-info`; `red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions` |
| `azure` | `backstage-community-plugin-azure-devops`; `backstage-community-plugin-azure-devops-backend` |
| `github` | `backstage-community-plugin-github-actions` |
| `jenkins` | `backstage-community-plugin-jenkins`; `backstage-community-plugin-jenkins-backend` |
| `kubernetes` | `backstage-plugin-kubernetes` |
| `mcp` | `backstage-plugin-mcp-actions-backend`; `red-hat-developer-hub-backstage-plugin-software-catalog-mcp-extras`; `red-hat-developer-hub-backstage-plugin-techdocs-mcp-extras`; `red-hat-developer-hub-backstage-plugin-scaffolder-mcp-extras` |
| `mcp-chat` | `backstage-community-plugin-mcp-chat-backend`; `backstage-community-plugin-mcp-chat` |
| `recommended` | `backstage-community-plugin-rbac`; `backstage-community-plugin-tech-radar`; `backstage-community-plugin-tech-radar-backend`; `devportal-marketplace-frontend-dynamic`; `devportal-marketplace-backend`; `devportal-pending-changes-dynamic` |
| `sonarqube` | `backstage-community-plugin-sonarqube`; `backstage-community-plugin-sonarqube-backend` |
| `veecode-theme` | `veecode-platform-plugin-veecode-theme` |

The six configuration-only presets are still migration subjects because they
change sign-in, identity, catalog or integration behavior. `github` plus
`github-auth` is therefore one useful composed scenario: one frontend package
comes from `github`, while the identity behavior is introduced by the
configuration-only `github-auth` preset.

## OFS surface scan

This is the first source/configuration scan of the active package declarations.
It records what the OFS host is asked to wire; it does not prove that the
artifact contains the named exports or that the surface renders at runtime.

| Subject | Declaration source | OFS surface currently declared | Initial migration class |
| --- | --- | --- | --- |
| VeeCode homepage | `dynamic-plugins.yaml` | 1 `dynamicRoutes` entry (`/`) + 1 translation resource | NFS page/navigation extension |
| VeeCode global header | `dynamic-plugins.yaml` | 11 `mountPoints` entries across application header and global header components + 1 translation resource | NFS host/header extension; high shell impact |
| VeeCode About | `dynamic-plugins.yaml` | 1 icon + 1 `dynamicRoutes` entry (`/about`) + `menuItems` | NFS page/navigation/icon extension |
| GitHub Actions | `presets/github.yaml` | 1 entity `mountPoint` | NFS entity blueprint; artifact currently tagged `bs_1.49.4` |
| Azure DevOps | `presets/azure.yaml` | 2 entity `mountPoints` | NFS entity blueprints; frontend/backend pair |
| Jenkins | `presets/jenkins.yaml` | 1 entity `mountPoint` | NFS entity blueprint; frontend/backend pair |
| Kubernetes | `presets/kubernetes.yaml` | 1 `entityTab` + 1 entity `mountPoint` | NFS reference class; source/artifact/runtime must be separated |
| MCP Chat | `presets/mcp-chat.yaml` | 1 `dynamicRoutes` entry + `menuItems` | NFS page/navigation extension; backend pair |
| RBAC | `presets/recommended.yaml` | 1 `dynamicRoutes` entry + 1 icon + `menuItems` | NFS page/navigation/icon extension |
| Tech Radar | `presets/recommended.yaml` | 1 icon + 1 `dynamicRoutes` entry + `menuItems` | NFS page/navigation/icon extension; frontend/backend pair |
| Marketplace | `presets/recommended.yaml` | 1 icon + 1 `dynamicRoutes` entry + `menuItems` | NFS page/navigation/icon extension; custom VeeCode fork |
| Pending changes | `presets/recommended.yaml` | 1 global/header `mountPoint` | NFS host/header extension |
| SonarQube | `presets/sonarqube.yaml` | 1 `entityTab` + 2 entity `mountPoints` | NFS entity blueprints; frontend/backend pair |
| VeeCode theme | `presets/veecode-theme.yaml` | 2 `themes` entries (`light`, `dark`) | NFS `ThemeBlueprint` or explicit replacement |
| Internal plugin info | `dynamic-plugins.yaml` | Empty `dynamicRoutes` and `mountPoints`; menu item disabled | Compatibility/package subject, not an active user-facing NFS surface |
| Backend-only packages and MCP extras | `dynamic-plugins.yaml`, `presets/mcp.yaml` and backend pairs | No frontend OFS declaration in these package entries | Backend/module inventory and configuration contract, not a frontend port by default |

The scan shows why “27 packages” is not a migration estimate. The visible OFS
surface is concentrated in a smaller set of host-sensitive classes, while
backend pairs and configuration-only presets still affect whether those
surfaces work.

## Version-provenance observation

[`backstage.json`](../../../../backstage.json) declares Backstage `1.53.0`,
but 11 optional package references in the presets still contain the literal
`bs_1.49.4` tag: Azure DevOps, GitHub Actions, Jenkins, Kubernetes, RBAC,
Tech Radar and SonarQube frontend/backend entries. Ten other optional entries
use `${BACKSTAGE_VERSION}`, and the six core entries are local/pre-installed
names without an OCI tag in this scope.

[`entrypoint.sh`](../../../../entrypoint.sh) resolves the placeholder form; it
does not rewrite the literal `bs_1.49.4` references. Consequently, the NFS
census must resolve the actual artifact reference and digest for every selected
subject. The image's `1.53.0` version alone cannot establish artifact
alignment, compatibility or NFS readiness.

## Required fields

Each fleet row should capture:

| Field | Meaning |
| --- | --- |
| `workspace` | Export-overlays workspace |
| `packageName` | Published package identity |
| `role` | Frontend, backend, or module |
| `sourceRef` | Source repository and commit inspected |
| `artifactRef` | OCI reference and resolved digest |
| `ofsSurface` | Current mount points, routes, themes, APIs and config |
| `nfsEntrypoint` | Whether the package exposes `./alpha` and what it exports |
| `nfsExtensions` | Blueprint/module classes found in source or artifact |
| `configContract` | Shared integrations, presets and plugin-owned config |
| `requiredHostFeatures` | Shell APIs, providers, routes or backend modules needed |
| `observedMode` | `ofs`, `nfs`, `ab` or `not-observed` |
| `status` | `unknown`, `source-ready`, `artifact-ready`, `runtime-verified`, `broken`, `gap`, `unsupported`, `requires-port`, `blocked`, `config-scenario`, `escalated`, `no-report` |
| `evidence` | Exact run, screenshot/DOM, logs, profile and digests |

## First control rows

| Case | Current evidence | Initial status |
| --- | --- | --- |
| Kubernetes reference | Backstage alpha plugin; local NFS shell discovered its route and entity extension | `runtime-verified` for shell discovery only; no cluster proof |
| `github-workflows` | Source has `createFrontendPlugin`, entity blueprints and `./alpha`; overlay still declares `mountPoints` | `source-ready`, NFS artifact not yet runtime-verified |
| Marketplace frontend | Source has page/nav/translation/API blueprints; package currently lacks an explicit `./alpha` export; overlay still declares legacy routes | `blocked` pending export/discovery decision |
| VeeCode theme | Current artifact is wired through legacy `themes`; source audit found no NFS alpha export | `requires-port` |
| `github` + `github-auth` | Composed preset/config contract; `github-auth` is not an isolated frontend plugin | `config-scenario`, frontend result pending |

These five rows are a control cohort, not a fleet readiness percentage.

## Classification rules

- `source-ready` means the inspected source appears to expose the required NFS
  entrypoint; it does not prove that the published artifact contains it.
- `runtime-verified` requires an attributable NFS surface assertion.
- `gap` means the harness or target shell could not observe a declared surface;
  it is not automatically a plugin failure.
- `broken` requires runtime evidence attributable to the plugin or its declared
  contract.
- `unknown` is a blocker for a complete census, not a green result.

## Next inventory slice

The full fleet census should be generated from the frozen export-overlays scope,
then enriched with source/package inspection. It must preserve the distinction
between upstream readiness, VeeCode fork readiness, artifact readiness and
runtime proof.
