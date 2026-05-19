---
name: shipped-presets
description: All presets shipped in the image, with their required variables and what they enable.
type: reference
audience: [operator]
related: [env-vars]
---

# Shipped presets

> Every preset in `presets/` at the current image tag. Each row is the operator's contract: what enabling the preset gives you and what env vars you must provide.

| Preset | What it enables | Required env vars |
|---|---|---|
| [`recommended`](../../presets/recommended.yaml) | Marketplace (front + back), pending-changes, tech-radar (sample data), RBAC UI | none |
| [`veecode-theme`](../../presets/veecode-theme.yaml) | VeeCode brand palette + typography + MUI component overrides | none |
| [`github`](../../presets/github.yaml) | GitHub PAT integration + repo discovery + Actions UI tab. Does NOT wire OAuth sign-in | `GITHUB_PAT`, `GITHUB_ORG` |
| [`gitlab`](../../presets/gitlab.yaml) | GitLab OAuth sign-in + integration + repo/org catalog discovery | `GITLAB_HOST`, `GITLAB_AUTH_CLIENT_ID`, `GITLAB_AUTH_CLIENT_SECRET`, `GITLAB_TOKEN`, `GITLAB_GROUP` |
| [`azure`](../../presets/azure.yaml) | Azure DevOps integration + catalog + pipelines / PR UI. Does NOT wire Microsoft sign-in | `AZURE_DEVOPS_TOKEN`, `AZURE_DEVOPS_HOST`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT` |
| [`keycloak`](../../presets/keycloak.yaml) | Keycloak / OIDC sign-in + keycloakOrg user/group sync | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `AUTH_SESSION_SECRET` |
| [`ldap`](../../presets/ldap.yaml) | LDAP sign-in + ldapOrg user/group sync (OpenLDAP defaults) | `LDAP_URL`, `LDAP_DN`, `LDAP_SECRET`, `LDAP_USERS_BASE_DN`, `LDAP_GROUPS_BASE_DN` |
| [`jenkins`](../../presets/jenkins.yaml) | Jenkins CI tab on entity pages | `JENKINS_URL`, `JENKINS_USERNAME`, `JENKINS_TOKEN` |
| [`kubernetes`](../../presets/kubernetes.yaml) | Kubernetes workloads tab on entity pages | `K8S_CLUSTER_NAME`, `K8S_CLUSTER_URL`, `K8S_CLUSTER_TOKEN` |
| [`sonarqube`](../../presets/sonarqube.yaml) | SonarQube code-quality tab + scaffolder action | `SONARQUBE_BASE_URL`, `SONARQUBE_API_KEY` |
| [`mcp`](../../presets/mcp.yaml) | MCP server at `/api/mcp-actions/v1` for external AI clients (Claude Code, Codex CLI, Cursor) via OAuth/DCR | none |
| [`mcp-chat`](../../presets/mcp-chat.yaml) | AI chat UI at `/mcp-chat`. **Compose with `mcp`** (loopback dependency) | `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`, `MCP_CHAT_MODEL` |

## Composition

Presets compose. `VEECODE_PRESETS=recommended,veecode-theme,github,sonarqube` enables the
baseline + VeeCode look + GitHub stack + SonarQube. Required variables are unioned across
the selected presets; the boot exits 78 listing every missing one.

## Adding a custom preset

See `topics/preset-authoring.md` (Phase 2). Until that ships, follow [`presets/README.md`](../../presets/README.md) § "Adding a new preset" and the [`presets/SCHEMA.md`](../../presets/SCHEMA.md) reference.
