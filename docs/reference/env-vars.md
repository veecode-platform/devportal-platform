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
| `DYNAMIC_PLUGINS_TOLERATE_FAILURES` | `docker/install-dynamic-plugins.py` | If `true`, per-plugin install failures are logged in an install summary but do not fail the boot (revert to pre-`649e2c8` behavior). Default behavior is exit 78 when any plugin fails to install. **Do not use in production** — defeats the half-installed-portal safeguard | `false` |
| `LOG_LEVEL` | upstream Backstage | Log verbosity | `info` |
| `DEBUG_PORT` | `entrypoint.sh` | If set, enables Node `--inspect=0.0.0.0:$DEBUG_PORT` | unset |
| `DEVELOPMENT` | `entrypoint.sh` | If `true`, runs under nodemon with config watching | `false` |
| `NODE_OPTIONS` | runtime | Forwarded to Node; image default `--no-node-snapshot` | image-set |
| `RBAC_POLICY_PATH` | `app-config.production.yaml:91` | Path inside the container to the RBAC policy CSV the permission backend loads | `/app/rbac-policy.csv` |
| `DEVPORTAL_DB_PATH` | `app-config.production.yaml:35` | Directory for the persistent per-plugin sqlite databases (one `<plugin>.sqlite` per plugin). Mount a volume here so DevPortal state — including the marketplace's installed-plugin record — survives a restart | `/app/data` |

## Theme / branding

> ⚠️ The `theme.json` vars (`THEME_DOWNLOAD_URL`, `THEME_CUSTOM_JSON`,
> `THEME_MERGE_JSON`, `PLATFORM_DEVPORTAL_THEME_URL`) were **removed**: on V2
> nothing reads `/app/packages/app/dist/theme.json` — the app dropped the
> `useLoaderTheme()` fetch and the theme is delivered as a dynamic frontend
> plugin (ADR-011; see the `veecode-theme` preset). Setting them now prints a
> boot WARNING and is otherwise ignored. The `theme.customJson` knob in the
> chart is pending deprecation (next-charts follow-up).

| Variable | Source | Purpose |
|---|---|---|
| `THEME_FAV_ICON` | `entrypoint.sh` | Favicon download URL |
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
