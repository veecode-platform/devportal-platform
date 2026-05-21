---
name: env-vars
description: Every environment variable the devportal-platform image consumes at boot, grouped by purpose.
type: reference
audience: [operator]
---

# Environment variables

> Every env var the image reads at startup. Grouped by purpose. Each row cites the source file so you can verify the behavior against current code.

## Platform-wide

| Variable | Source | Purpose | Default |
|---|---|---|---|
| `VEECODE_PRESETS` | `entrypoint.sh` | Comma-separated list of presets to apply | unset (boots barebones) |
| `VEECODE_APP_CONFIG` | `entrypoint.sh` | Base64-encoded `app-config.yaml` overlay (decodes into `/app/app-config.saas.yaml`) | unset |
| `VEECODE_DOMAIN` | `entrypoint.sh` | Informational only; logged at startup | unset |
| `BACKSTAGE_VERSION` | `entrypoint.sh` | Substituted into plugin OCI tag refs; defaults to the version in `backstage.json` | read from `backstage.json` |
| `PLUGIN_REGISTRY` | `entrypoint.sh` | Substituted into plugin OCI registry prefix | `quay.io/veecode` |
| `CATALOG_INDEX_IMAGE` | `entrypoint.sh` | OCI image carrying the marketplace catalog index | `quay.io/veecode/plugin-catalog-index:latest` |
| `CATALOG_INDEX_REFRESH` | `entrypoint.sh` | Force a re-download of the catalog index on boot | `false` |
| `LOG_LEVEL` | upstream Backstage | Log verbosity | `info` |
| `DEBUG_PORT` | `entrypoint.sh` | If set, enables Node `--inspect=0.0.0.0:$DEBUG_PORT` | unset |
| `DEVELOPMENT` | `entrypoint.sh` | If `true`, runs under nodemon with config watching | `false` |
| `NODE_OPTIONS` | runtime | Forwarded to Node; image default `--no-node-snapshot` | image-set |
| `RBAC_POLICY_PATH` | `app-config.production.yaml:91` | Path inside the container to the RBAC policy CSV the permission backend loads | `/app/rbac-policy.csv` |
| `DEVPORTAL_DB_PATH` | `app-config.production.yaml:35` | Directory for the persistent per-plugin sqlite databases (one `<plugin>.sqlite` per plugin). Mount a volume here so DevPortal state — including the marketplace's installed-plugin record — survives a restart | `/app/data` |

## Theme / branding (legacy chart)

> ⚠️ `THEME_CUSTOM_JSON` with `THEME_MERGE_JSON=false` currently writes to a
> broken path in `entrypoint.sh` (double-`dist`). The merge path
> (`THEME_MERGE_JSON=true`, default) is unaffected. Tracked as a code bug
> separate from this reference.

| Variable | Source | Purpose |
|---|---|---|
| `THEME_DOWNLOAD_URL` | `entrypoint.sh` | Download URL for a `theme.json` overlay |
| `THEME_CUSTOM_JSON` | `entrypoint.sh` | Inline `theme.json` content (overrides `THEME_DOWNLOAD_URL`) |
| `THEME_MERGE_JSON` | `entrypoint.sh` | If `false`, replace rather than merge `theme.json` |
| `THEME_FAV_ICON` | `entrypoint.sh` | Favicon download URL |
| `PLATFORM_DEVPORTAL_THEME_URL` | `entrypoint.sh` | Legacy chart equivalent of `THEME_DOWNLOAD_URL` |
| `PLATFORM_DEVPORTAL_FAVICON` | `entrypoint.sh` | Legacy chart equivalent of `THEME_FAV_ICON` |

## Per-preset variables

Each integration preset declares its required env vars in
`requires.variables`. See `shipped-presets.md` for the full per-preset
list, or [`presets/<preset-name>.yaml`](../../presets) for the
authoritative contract.

Examples (subset):

| Preset | Variables |
|---|---|
| `github` | `GITHUB_PAT`, `GITHUB_ORG` |
| `keycloak` | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `AUTH_SESSION_SECRET` |
| `azure` | `AZURE_DEVOPS_TOKEN`, `AZURE_DEVOPS_HOST`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT` |
| `mcp-chat` | `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`, `MCP_CHAT_MODEL` |

Missing a required var fails the boot with exit 78 and a
preset-aware error.
