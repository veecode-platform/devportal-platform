# Docker Development

This repo builds **one image**: `veecode/devportal-platform`. The published
image is `docker.io/veecode/devportal-platform:<version>` plus `:latest`,
multi-arch (`linux/amd64` + `linux/arm64`).

## Build model

The image follows the canonical Backstage pattern: **compilation happens on the
host or CI runner, not inside `docker build`**. The Dockerfile only packages
pre-built artefacts — it never runs `tsc`, `webpack`, or `yarn install` for the
full monorepo.

```
1. yarn install --immutable && yarn build:backend   ← on the host / CI runner
   → generates packages/backend/dist/skeleton.tar.gz + bundle.tar.gz

2. docker build .                                   ← packages the artefacts
   → yarn workspaces focus --production (prod deps only)
   → copies configs, presets, policies
   → downloads baked plugins (lightweight npm pack, no compilation)
```

## Building locally

Use the wrapper script — it handles both steps in order:

```bash
./scripts/build-local-image.sh
```

If you have already run `yarn build:backend` and just want to rebuild the image
(e.g. you changed a config file, not source code):

```bash
./scripts/build-local-image.sh --skip-build
```

Or run the steps manually:

```bash
yarn install --immutable
yarn build:backend          # → packages/backend/dist/skeleton.tar.gz + bundle.tar.gz
docker build . \
  -t veecode/devportal-platform:local \
  --build-arg DEVPORTAL_VERSION=local
```

### Build args

- `DEVPORTAL_VERSION` — written into `/app/devportal.json` and read by the
  About plugin. Defaults to `dev`. Set to the semver you intend to publish.
- `NODE_BASE_RUNTIME` — UBI minimal Node runtime base image. Pinned by digest
  for reproducible multi-arch builds. See
  [ADR-012](adr/012-anonymous-ubi-mirror.md).
- `NPM_REGISTRY` — for offline / mirrored installs. Defaults to
  `https://registry.npmjs.org/`. If you point this at a private registry, the
  Dockerfile adds the host to Yarn's `unsafeHttpWhitelist` automatically.
- `EXTENSIONS_TAG` — the `quay.io/veecode/extensions` OCI tag for the RHDH
  `catalog-backend-module-extensions` artifact. Defaults to `bs_1.49.4`. See
  "The `cbme` stopgap" below.
- `YQ_VERSION`, `DECK_VERSION`, `KUBECTL_VERSION` — pinned versions for `yq`,
  Kong `deck`, and `kubectl`. Bump independently as needed.

## What the image contains

The [`Dockerfile`](../Dockerfile) is a single-stage runtime image. It takes
the pre-built backend bundle and packages it alongside production dependencies
and runtime tooling under `/app/`:

```text
/app/
├── packages/backend/                        # Backend bundle (unpacked from bundle.tar.gz)
├── dynamic-plugins-root/                    # Baked plugins; further populated at boot from OCI
├── presets/                                 # Preset catalog
├── catalog-entities/extensions/             # Marketplace catalog YAMLs (baked-in fallback)
├── app-config.yaml
├── app-config.production.yaml
├── app-config.distro.yaml
├── dynamic-plugins.yaml
├── dynamic-plugins.default.yaml
├── data/extensions-install.yaml             # Marketplace install state; persistent volume
├── rbac-policy.csv                          # rbac-policy-extensions.csv appended at build time
├── install-dynamic-plugins.py
├── install-dynamic-plugins.sh
├── entrypoint.sh
└── devportal.json                           # { "version": "${DEVPORTAL_VERSION}" }
```

Runtime binaries baked into the image alongside Node 22:

- `yq` (mikefarah) — preset resolution, config edits at boot.
- `skopeo` — pulls OCI dynamic plugin artifacts at boot.
- `kubectl` — used by the kubernetes plugin's proxy mode.
- `deck` (Kong) — scaffolder action for Kong gateway management.
- `mkdocs` + the TechDocs mkdocs deps from
  [`python/requirements.txt`](../python/requirements.txt).

## The `cbme` stopgap

This bites if you bump `EXTENSIONS_TAG` blindly. [`Dockerfile`](../Dockerfile)
documents it in detail; the short version:

- The marketplace's catalog provider (`catalog-backend-module-extensions`)
  is pulled from `quay.io/veecode/extensions:bs_1.49.4` via skopeo.
- That build was compiled for Backstage 1.49.x and imports
  `catalogProcessingExtensionPoint` from `@backstage/plugin-catalog-node/alpha`.
  Backstage 1.50 graduated it to the main `@backstage/plugin-catalog-node`
  export, so on 1.50 the `/alpha` import is `undefined` and the catalog
  plugin crashes at boot — 503 storms, marketplace "Catalog" tab empty.
- The Dockerfile patches `dist/module.cjs.js` with a `sed`:
  `if (!alpha.catalogProcessingExtensionPoint) alpha = Object.assign({}, alpha, require('@backstage/plugin-catalog-node'));`

When `quay.io/veecode/extensions:bs_1.50.0` is published by
`devportal-plugin-export-overlays`, set `EXTENSIONS_TAG=bs_1.50.0` and drop
the sed (the Dockerfile comment spells out the cleanup).

## Running the image

```bash
# Minimum — boots with whatever the image bakes in (no presets).
docker run -p 7007:7007 --memory=2g veecode/devportal-platform:local

# Realistic — recommended baseline + theme + GitHub.
docker run -p 7007:7007 --memory=2g \
  -e VEECODE_PRESETS=recommended,veecode-theme,github \
  -e GITHUB_PAT=ghp_… \
  -e GITHUB_ORG=my-org \
  -e AUTH_GITHUB_CLIENT_ID=… \
  -e AUTH_GITHUB_CLIENT_SECRET=… \
  veecode/devportal-platform:local

# Mount a custom app-config (raw Backstage path; no preset).
docker run -p 7007:7007 --memory=2g \
  -v $(pwd)/app-config.local.yaml:/app/app-config.local.yaml:ro \
  veecode/devportal-platform:local
```

Ports: the image listens on `:7007`. The frontend is served from the same port
(the backend `app-backend` plugin serves the bundled frontend at `/`).

Memory: 2 GB is enough to run the container. The heavy compilation (tsc,
webpack) now happens on the host before `docker build`, so no extra memory is
needed for the image build itself.

## Inner-loop development against the image

The `scripts/dev-run.sh` overlay flow bind-mounts the repo's
`entrypoint.sh`, `presets/`, `dynamic-plugins.default.yaml`, the
`app-config.*.yaml` set, and `docker/install-dynamic-plugins.py` over
the image's copies. A `docker restart` (~30s) is then enough to pick
up changes — full details in
[`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) § "Image overlay loop".

## Publish

Image publish is a manual GitHub Actions dispatch
([`.github/workflows/publish.yml`](../.github/workflows/publish.yml)):
each per-arch job (amd64 on `ubuntu-latest`, arm64 on `ubuntu-22.04-arm`)
runs `yarn build:backend` first, then builds and pushes the Docker image.
A final `manifest` job stitches the per-arch tags under `<version>` and
`latest`. See [`RELEASE_CYCLE.md`](RELEASE_CYCLE.md) for the full procedure.

No Red Hat credentials are required — UBI is pulled from the anonymous mirror
per ADR-012. The only secrets needed are `DOCKER_USERNAME` and
`DOCKER_PASSWORD`.

## Troubleshooting

**`yarn build:backend` OOM on WSL** — the `packages/app` type-check needs
~5 GB of V8 heap. If it OOMs, increase WSL's memory allocation in
`%USERPROFILE%\.wslconfig` (`memory=10GB` or more) and retry. This runs on
the host (not inside Docker), so Docker memory limits don't apply here.

**`docker build` fails with "skeleton.tar.gz not found"** — the artefacts from
`yarn build:backend` are missing. Run `./scripts/build-local-image.sh` (without
`--skip-build`) to generate them first.

**`skopeo copy` fails in the cbme step** — the `quay.io/veecode/extensions:bs_X.Y.Z`
image set in `EXTENSIONS_TAG` may not exist yet. Check what
`devportal-plugin-export-overlays` has published; the Dockerfile emits a warning
and continues but the marketplace catalog will be empty.

**Build cache is too aggressive after a yarn.lock change** —
`docker buildx prune` and rebuild. The Dockerfile layers the production
`yarn workspaces focus` after the skeleton extract, so a lockfile change
invalidates from that point forward.

**`registry.access.redhat.com` rate-limits in CI** — see ADR-012 §
"Anonymous rate limits". If it bites, opt into `registry.redhat.io` for
`publish.yml` (requires `REDHAT_USER` / `REDHAT_PASS` secrets and a
`skopeo login` step).
