# DevPortal POC — unified image + presets

> **Status: experimental POC.** This repo is a proof-of-concept for collapsing
> [`devportal-base`](https://github.com/veecode-platform/devportal-base) +
> [`devportal-distro`](https://github.com/veecode-platform/devportal-distro) into
> a single image with a YAML preset catalog and OCI-loaded dynamic plugins.
> Production deployments should continue to use `devportal-base` /
> `devportal` until the POC is promoted.
>
> Rationale, scope, and validation criteria: [`docs/adr/010-unified-image-and-presets.md`](docs/adr/010-unified-image-and-presets.md).

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![Backstage](https://img.shields.io/badge/Backstage-1.49.4-9BF0E1?logo=backstage)

VeeCode DevPortal is an open-source [Backstage](https://backstage.io) distribution
designed to be production-ready from day one.

This POC repo demonstrates the unified architecture:

- **Single image** (no base + distro split). One Dockerfile, one CI, one release.
- **Preset catalog** (`presets/`) — versioned, composable contracts that turn
  the generic image into a working IDP for a specific situation. Each preset
  declares the plugins it needs, the env vars the operator must provide, and
  the app-config those plugins expect.
- **OCI dynamic plugins** as the default distribution channel. Image stays
  small; plugin lifecycles decouple from the image lifecycle.
- **Backstage 1.49.4** baseline (1.50 migration deferred — see ADR-010 § Migration deferral).

The repository is structured for local development with a Node runtime, but it also helps running containerized builds and helps building a definitive and production-ready container image.

## Quick Start

If you just want to see a running container, you can use the following command:

```sh
docker run --name devportal -d -p 7007:7007 veecode/devportal-platform:latest
```

Or, it you want to run it interactively with pretty logs:

```sh
docker run --rm -ti -p 7007:7007 -e NODE_ENV=development veecode/devportal-platform:latest
```

And open `http://localhost:7007` in your browser. It will open a barebones DevPortal instance, with just a sample catalog and a few basic plugins enabled. This image is **not** a full Backstage distro, but a minimal one used as starting point to build a real distro and to validate the core set of DevPortal plugins.

### Enabling GitHub Login

We have shipped a few auth providers with this image, but the most common is the GitHub auth provider. To enable it, you need to set a few extra environment variables:

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PROFILE=github \
  --env GITHUB_CLIENT_ID \
  --env GITHUB_CLIENT_SECRET \
  --env GITHUB_ORG \
  --env GITHUB_APP_ID \
  --env GITHUB_PRIVATE_KEY \
  veecode/devportal-platform:latest
```

Providing the environment variables above will enable GitHub login and populate the catalog with your GitHub organization. Check our documentation on [GitHub Authentication](https://docs.platform.vee.codes/devportal/integrations/GitHub/github-auth) for more details.

### Enabling Keycloak Login

We have also shipped a Keycloak auth provider in the base image. To enable it, you need to set a few extra environment variables:

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PROFILE=keycloak \
  --env KEYCLOAK_BASE_URL \
  --env KEYCLOAK_CLIENT_ID \
  --env KEYCLOAK_CLIENT_SECRET \
  --env KEYCLOAK_REALM \
  --env AUTH_SESSION_SECRET \
  veecode/devportal-platform:latest
```

Providing the environment variables above will enable GitHub login and populate the catalog with your GitHub organization. Check our documentation on [Keycloak Authentication](https://docs.platform.vee.codes/devportal/integrations/Keycloak/keycloak-auth) for more details.

### Enabling Azure Login

We have also shipped an Azure AD auth provider in the base image. To enable it, you need to set a few extra environment variables:

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PROFILE=azure \
  --env AZURE_CLIENT_ID \
  --env AZURE_CLIENT_SECRET \
  --env AZURE_TENANT_ID \
  --env AZURE_ORGANIZATION \
  --env AZURE_PROJECT \
  --env AZURE_TOKEN \
  --env AUTH_SESSION_SECRET \
  veecode/devportal-platform:latest
```

Providing the environment variables above will enable Azure AD login and populate the catalog with your Azure DevOps organization. Check the documentation in `auth-examples/azure/AZURE.md` for more details.

### Understand Start Behavior

The container start script (CMD) merges the app-config files provided by the image in the following order:

- app-config.yaml
- app-config.production.yaml
- app-config.dynamic-plugins.yaml

If provided, VEECODE_PROFILE will be used to load the app-config.{profile}.yaml file (allowed values are "github", "keycloak", "azure" and "local").

You can use mounts and env vars at will to override configs at your will. The bundled configs and start scripts are just convenient examples and can be changed or discarded.

## Quick Links

There are a few sections for later reading if you want some deeper understanding of this project:

- **[Plugin Architecture & Management](docs/PLUGINS.md)** - Understanding and working with plugins
- **[Docker Development](docs/DOCKER_DEVELOPMENT.md)** - Explains the current container development options
- **[Local Docker Build Guide](docker/README.md)** - Building container images locally for development

## Local development

### Understanding app-config files

The main config file for DevPortal is `app-config.yaml`. It contains the default configuration for the application with minimal settings.

Several other app-config examples are provided in this repo, so you can merge them as you see fit by using an extra `--config` flag for each one.

- `app-config.yaml`: minimal default config, guest auth enabled as admin user
- `app-config.dynamic-plugins.yaml`: dynamic plugins default configs (required for header/home plugins)
- `app-config.local.yaml`: local development config (gitignored, so you can use secrets inline)
- `app-config.github.yaml`: github auth config (relies on env vars)
- `app-config.keycloak.yaml`: keycloak auth config (relies on env vars)
- `app-config.production.yaml`: "production" (in-container) config and paths

### Build and run

**Step 1: Build preinstalled plugins** (see [PLUGINS.md](docs/PLUGINS.md) for details):

This step isnt exactly a build itself, but it prepares pre-built plugins for dynamic loading under DevPortal. It deals with native dynamic plugins and with wrappers around older plugins, exporting them as ready-to-load dynamic plugins under a `dynamic-plugins-root` directory:

```sh
cd dynamic-plugins/
yarn install
yarn build
yarn export-dynamic
yarn copy-dynamic-plugins $(pwd)/../dynamic-plugins-root
```

You can read [Plugin Architecture & Management](docs/PLUGINS.md) for more details.

**Step 2: Build and start the application**:

```sh
yarn install
yarn build
# change log level at will
LOG_LEVEL=debug yarn dev-local
```

**Default ports:**

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:7007`

## Development Tips

### Relaxing Security for Local Development

For local development, you can simplify authentication by:

- Using a fixed backend token
- Enabling the guest auth provider with an assumed identity

⚠️ **Warning:** Only use this configuration in local development environments.

Create or edit `app-config.local.yaml` with:

```yaml
# Backstage override configuration for your local development environment
backend:
  auth:
    secret: mysecret
    #dangerouslyDisableDefaultAuthPolicy: true

auth:
  # see https://backstage.io/docs/auth/ to learn about auth providers
  providers:
    # See https://backstage.io/docs/auth/guest/provider
    guest:
      userEntityRef: user:default/admin
      ownershipEntityRefs: [group:default/admins]
      dangerouslyAllowOutsideDevelopment: true
```

### Accessing Backend Endpoints

Backend API endpoints require authentication. The examples below show how to obtain and use a token (requires the relaxed security configuration above):

```sh
# get a Backstage user token via the guest provider
USER_TOKEN="$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.backstageIdentity.token')"

# list loaded dynamic plugins
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins

# list catalog components
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:7007/api/catalog/entities\?filter\=kind\=Component

# list all scaffolder actions
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:7007/api/scaffolder/v2/actions

# healthcheck (no auth)
curl -vvv http://localhost:7007/healthcheck

# version (no auth)
curl -vvv http://localhost:7007/version

# send notification
# token defined by "backend.auth.externalAccess[0].options.token"
NOTIFY_TOKEN="test-token"
curl -X POST http://localhost:7007/api/notifications/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NOTIFY_TOKEN" \
  -d '{
        "recipients": {
          "type": "broadcast"
        },
        "payload": {
          "title": "Title of broadcast message",
          "description": "The description of the message.",
          "link": "http://example.com/link",
          "severity": "high",
          "topic": "general"
        }
      }'
```

### Tech Docs Tips

If you want to test Tech Docs processing with `mkdocs` locally:

```sh
python3 -m venv $(pwd)/venv
source venv/bin/activate
pip install -r python/requirements.txt
```

Make sure to have the virtual environment activated when running DevPortal so it the TechDocs plugin can work properly. The PATH variable is ajusted by `activate` to use `mkdocs` from the virtual environment.

There are some conditions after `activate` that will trick your shell into not using `mkdocs` from the virtual environment. You can check if it is using the correct `mkdocs` version by running:

```sh
which mkdocs
```

If it is not using the correct version from the virtual environment, you can try to fix it by running:

```sh
hash -r
# should now show the correct path
which mkdocs
```

## Additional Notes

### Relationship to RHDH

Many code patterns and mechanics in this project are inspired by [Red Hat Developer Hub (RHDH)](https://github.com/redhat-developer/rhdh). Some files have been copied or adapted from RHDH, both manually and with AI assistance, in accordance with its open-source license. We include attribution notices in files derived from RHDH where required. If you find any missing attributions, please let us know so we can correct them.

**Important:** VeeCode DevPortal is **not** a fork of RHDH. It is an independent open-source project that leverages proven patterns and code from RHDH to deliver a production-ready Backstage distribution.

## License

Check the [LICENSE](LICENSE) file for details. Yes, we are full open source and we welcome contributions.
