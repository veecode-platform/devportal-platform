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
| `VEECODE_PRESETS` | `entrypoint.sh:98` | Comma-separated list of presets to apply | unset (boots barebones) |
| `VEECODE_APP_CONFIG` | `entrypoint.sh:168` | Base64-encoded `app-config.yaml` overlay (decodes into `/app/app-config.saas.yaml`) | unset |
| `VEECODE_DOMAIN` | `entrypoint.sh:245` | Informational only; logged at startup | unset |
| `BACKSTAGE_VERSION` | `entrypoint.sh:214` | Substituted into plugin OCI tag refs; defaults to the version in `backstage.json` | read from `backstage.json` |
| `PLUGIN_REGISTRY` | `entrypoint.sh:230` | Substituted into plugin OCI registry prefix | `quay.io/veecode` |
| `CATALOG_INDEX_IMAGE` | `entrypoint.sh:46` | OCI image carrying the marketplace catalog index | `quay.io/veecode/plugin-catalog-index:latest` |
| `CATALOG_INDEX_REFRESH` | `entrypoint.sh:49` | Force a re-download of the catalog index on boot | `false` |
| `LOG_LEVEL` | upstream Backstage | Log verbosity | `info` |
| `DEBUG_PORT` | `entrypoint.sh:290` | If set, enables Node `--inspect=0.0.0.0:$DEBUG_PORT` | unset |
| `DEVELOPMENT` | `entrypoint.sh:297` | If `true`, runs under nodemon with config watching | `false` |
| `NODE_OPTIONS` | runtime | Forwarded to Node; image default `--no-node-snapshot` | image-set |

## Theme / branding (legacy chart)

| Variable | Source | Purpose |
|---|---|---|
| `THEME_DOWNLOAD_URL` | `entrypoint.sh:17` | Download URL for a `theme.json` overlay |
| `THEME_CUSTOM_JSON` | `entrypoint.sh:20` | Inline `theme.json` content (overrides `THEME_DOWNLOAD_URL`) |
| `THEME_MERGE_JSON` | `entrypoint.sh:21` | If `false`, replace rather than merge `theme.json` |
| `THEME_FAV_ICON` | `entrypoint.sh:38` | Favicon download URL |
| `PLATFORM_DEVPORTAL_THEME_URL` | `entrypoint.sh:6` | Legacy chart equivalent of `THEME_DOWNLOAD_URL` |
| `PLATFORM_DEVPORTAL_FAVICON` | `entrypoint.sh:11` | Legacy chart equivalent of `THEME_FAV_ICON` |

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
