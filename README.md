# VeeCode DevPortal — unified image + presets

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![Backstage](https://img.shields.io/badge/Backstage-1.49.4-9BF0E1?logo=backstage)

VeeCode DevPortal is an open-source [Backstage](https://backstage.io)
distribution. This repo ships **one image**:
`docker.io/veecode/devportal-platform`. There is no base/distro split.

To turn the generic image into a working IDP, the operator selects
**presets** at runtime (`VEECODE_PRESETS=recommended,github,…`). Each
preset is a versioned YAML contract that declares which plugins it
needs, which env vars the operator must provide, and which app-config
to layer in.

- **Single image.** One Dockerfile, one CI, one release.
- **Preset catalog** in [`presets/`](presets/) — composable contracts
  that take the generic image to a specific stack. See
  [`presets/README.md`](presets/README.md) and
  [`presets/SCHEMA.md`](presets/SCHEMA.md).
- **Dynamic plugin loading** via Scalprum + Webpack Module
  Federation. Plugins are fetched as OCI bundles at boot from
  [`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays);
  a few always-on chrome plugins are pulled from npm.
- **Backstage 1.49.4** baseline. 1.50 migration deferred (see
  [`docs/adr/011-frontend-design-system.md`](docs/adr/011-frontend-design-system.md)
  § Phase 2).

For the full picture, start with
[`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).

## Quick start

Run the image with no preset to get a barebones DevPortal (guest
auth, sample catalog, just the core plugins enabled):

```sh
docker run --name devportal -d -p 7007:7007 \
  veecode/devportal-platform:latest
```

Open `http://localhost:7007`.

For a richer out-of-the-box experience, turn on `recommended` and the
VeeCode theme:

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme \
  veecode/devportal-platform:latest
```

That adds the marketplace, RBAC UI, tech-radar (with sample data),
the pending-changes badge, and the VeeCode brand theme.

### Enabling GitHub integration

The `github` preset configures the (static) GitHub catalog provider
and the GitHub integration so the scaffolder can create repos. It
needs:

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme,github \
  -e GITHUB_PAT=ghp_…                  \
  -e GITHUB_ORG=my-org                 \
  veecode/devportal-platform:latest
```

> **Note.** The `github` preset wires the catalog provider, the
> scaffolder integration, and the GitHub Actions UI — but it does
> **not** configure the GitHub auth provider (OAuth login). To enable
> GitHub login, mount an `app-config.local.yaml` that sets
> `auth.providers.github.production.{clientId,clientSecret}` and
> `app.baseUrl` / `backend.baseUrl` for your callback URL.
> [`docs/CONFIGURATION_GUIDE.md`](docs/CONFIGURATION_GUIDE.md) covers
> the raw-Backstage layering path.

See [`presets/github.yaml`](presets/github.yaml) for the full preset
definition.

### Enabling Keycloak login

The `keycloak` preset wires the OIDC auth provider end-to-end plus
the Keycloak user/group catalog sync. It needs:

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme,keycloak \
  -e KEYCLOAK_BASE_URL=https://keycloak.example.com/auth \
  -e KEYCLOAK_REALM=my-realm \
  -e KEYCLOAK_CLIENT_ID=backstage \
  -e KEYCLOAK_CLIENT_SECRET=… \
  -e AUTH_SESSION_SECRET=$(openssl rand -base64 32) \
  veecode/devportal-platform:latest
```

See [`presets/keycloak.yaml`](presets/keycloak.yaml).

### Other integration presets

`azure`, `gitlab`, `ldap`, `jenkins`, `kubernetes`, `sonarqube` are
all available in [`presets/`](presets/). Each preset's
`requires.variables` lists the env vars the operator must set, with
a `docs` URL pointing at the provider's documentation.

Presets compose: `VEECODE_PRESETS=recommended,veecode-theme,github,keycloak,sonarqube`
combines them. The boot fails fast (exit 78) with a clear message if
any required env var is missing.

The full preset catalog is documented in
[`docs/CONFIGURATION_GUIDE.md`](docs/CONFIGURATION_GUIDE.md).

### Boot config precedence

[`entrypoint.sh`](entrypoint.sh) assembles the Backstage backend's
`--config` flags in this order (later overrides earlier):

1. `app-config.yaml` — base defaults.
2. `app-config.production.yaml` — container/production overrides.
3. `app-config.distro.yaml` — distro escape hatch.
4. `app-config.preset-<name>.yaml` — one per selected preset, in
   `VEECODE_PRESETS` order.
5. `app-config.local.yaml` — operator overrides (volume mount or
   `VEECODE_APP_CONFIG` base64-decoded).
6. `dynamic-plugins-root/app-config.dynamic-plugins.yaml` — generated
   at boot from each plugin's `pluginConfig:`.
7. `app-config.saas.yaml` — SaaS-time overrides.

`app-config.local.yaml` always wins over preset config — operators
can override anything without forking the preset.

## Quick links

- [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — what this
  image is, two paths of use, what's _not_ here.
- [`docs/DEVELOPMENT_GUIDE.md`](docs/DEVELOPMENT_GUIDE.md) — local
  dev: `yarn dev-local` vs `scripts/dev-run.sh`.
- [`docs/DOCKER_DEVELOPMENT.md`](docs/DOCKER_DEVELOPMENT.md) —
  building and running the image; the `cbme` stopgap.
- [`docs/CONFIGURATION_GUIDE.md`](docs/CONFIGURATION_GUIDE.md) —
  preset catalog, layering, raw Backstage path.
- [`docs/PLUGINS.md`](docs/PLUGINS.md) — static, internal, and
  dynamic plugin inventory.
- [`docs/DYNAMIC_PLUGINS_ARCHITECTURE.md`](docs/DYNAMIC_PLUGINS_ARCHITECTURE.md)
  — Scalprum + Module Federation runtime; authoring gotchas.
- [`docs/UPGRADING.md`](docs/UPGRADING.md) — Backstage, UBI, and
  `EXTENSIONS_TAG` upgrade tracks.
- [`docs/RBAC.md`](docs/RBAC.md) — shipped policy and per-deploy
  overrides.

## Local development

### Prerequisites

- Node.js 20 or 22.
- Yarn 4.12.0 (enabled via Corepack:
  `corepack enable && corepack prepare yarn@4.12.0 --activate`).
- Docker (only for the image-overlay dev loop and image builds).
- Python 3.12 + venv (only if you want TechDocs to render locally).

### First-time setup

```sh
yarn install
```

That's it for the host workspace. Dynamic plugins are fetched as OCI
bundles at boot inside the image (see
[`docs/MONOREPO_STRUCTURE.md`](docs/MONOREPO_STRUCTURE.md) for layout).

### Run

```sh
yarn dev-local        # frontend on :3000, backend on :7007
```

The script reads three configs: `app-config.yaml`,
`app-config.local.yaml` (gitignored — start from
[`app-config.local.template.yaml`](app-config.local.template.yaml)),
and `app-config.dynamic-plugins.yaml`.

For changes to presets / the entrypoint / dynamic plugins, the Node
dev loop won't see them — use the image overlay loop:

```sh
./scripts/dev-run.sh run     # bind-mounts your repo over the image
./scripts/dev-run.sh reload  # docker restart after editing a mounted file
./scripts/dev-run.sh logs
./scripts/dev-run.sh stop
```

Full details in
[`docs/DEVELOPMENT_GUIDE.md`](docs/DEVELOPMENT_GUIDE.md).

### Configs that ship with the repo

- [`app-config.yaml`](app-config.yaml) — base defaults; guest auth
  enabled, in-memory SQLite, sample catalog locations.
- [`app-config.production.yaml`](app-config.production.yaml) —
  container-only overrides (production paths, refresh tokens,
  catalog locations under `/app/examples/`).
- [`app-config.distro.yaml`](app-config.distro.yaml) — ~10-line
  distro defaults (adds `extensions` to
  `permission.rbac.pluginsWithPermission`).
- [`app-config.local.template.yaml`](app-config.local.template.yaml)
  — template for your local override. Copy to
  `app-config.local.yaml` (gitignored).

The integration auth configs (`app-config.github.yaml`,
`app-config.keycloak.yaml`, …) from `devportal-base` are **not**
present here — that information lives in the preset YAMLs under
[`presets/`](presets/).

## Development tips

### Relaxing security for local development

Guest auth is already enabled in `app-config.yaml` with
`userEntityRef: user:default/admin` and
`dangerouslyAllowOutsideDevelopment: true` — every guest session
lands as the admin user, so there's nothing extra to configure.

For a hand-rolled backend service token (rarely needed today; mainly
for hitting authenticated APIs from scripts), add to
`app-config.local.yaml`:

```yaml
backend:
  auth:
    externalAccess:
      - type: static
        options:
          token: my-test-token
          subject: test-subject
```

> **⚠️ Don't ship this configuration.** Static tokens are for local
> development only.

### Hitting the backend

```sh
# Get a guest token
USER_TOKEN="$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.backstageIdentity.token')"

# Inspect loaded dynamic plugins
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins

# List catalog entities
curl -H "Authorization: Bearer $USER_TOKEN" \
  'http://localhost:7007/api/catalog/entities?filter=kind=Component'

# Scaffolder actions
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:7007/api/scaffolder/v2/actions

# Health + version (no auth)
curl http://localhost:7007/healthcheck
curl http://localhost:7007/api/version
```

### TechDocs locally

```sh
python3 -m venv ./venv
source venv/bin/activate
pip install -r python/requirements.txt
```

Keep the venv activated when running `yarn dev-local`; the backend
shells out to `mkdocs` on `PATH`. Verify with `which mkdocs` — if
it's not the venv copy, run `hash -r` and re-check.

## Building the image

```sh
docker build . \
  -t veecode/devportal-platform:local \
  --memory=4g --memory-swap=6g \
  --build-arg DEVPORTAL_VERSION=local
```

The memory flags are required on WSL — the frontend build needs ~6
GB of V8 heap. There's a wrapper script with sensible defaults:

```sh
./scripts/build-local-image.sh
```

Full build-arg reference and the `cbme` stopgap are in
[`docs/DOCKER_DEVELOPMENT.md`](docs/DOCKER_DEVELOPMENT.md).

## Releases

Image publish is **manual-dispatch only**
([`.github/workflows/publish.yml`](.github/workflows/publish.yml)).

```sh
gh workflow run publish.yml -f version=0.2.0
```

The workflow validates the input matches `package.json` `version`,
builds `linux/amd64` and `linux/arm64`, and stitches both into a
multi-arch manifest under `<version>` and `latest`. See
[`docs/RELEASE_CYCLE.md`](docs/RELEASE_CYCLE.md).

## Relationship to RHDH

Many code patterns and mechanics — especially the dynamic-plugin
shell in `packages/app/src/components/DynamicRoot/` — are inspired
by [Red Hat Developer Hub (RHDH)](https://github.com/redhat-developer/rhdh).
Some files are adapted from RHDH (manually and with AI assistance) in
accordance with its open-source license; attribution notices are
included where required. If you find a missing attribution, please
let us know so we can correct it.

**VeeCode DevPortal is not a fork of RHDH.** It's an independent
project that leverages proven RHDH patterns where they save us time.

## License

[Apache 2.0](LICENSE). We welcome contributions.
