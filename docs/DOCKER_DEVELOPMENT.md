# Docker Development

This repo builds **one image**: `veecode/devportal-platform`. There is
no base/distro split — both layers were collapsed into a single
multi-stage [`Dockerfile`](../Dockerfile). The published image is
`docker.io/veecode/devportal-platform:<version>` plus `:latest`,
multi-arch (`linux/amd64` + `linux/arm64`).

## Building locally

```bash
docker build . \
  -t veecode/devportal-platform:local \
  --memory=4g --memory-swap=6g \
  --build-arg DEVPORTAL_VERSION=local
```

The memory flags are not optional on WSL — the frontend build needs
~6 GB of V8 heap and the dnf upgrade step plus the dynamic-plugin
export are themselves heavy. Without `--memory`, builds die at exit
129 (JavaScript heap OOM) or get killed by the kernel OOM killer.

There is a wrapper script:

```bash
./scripts/build-local-image.sh
```

It applies sensible defaults (memory, build-args), and an
optional `--quick` mode for iterating.

### Build args

- `DEVPORTAL_VERSION` — written into `/app/devportal.json` and read by
  the About plugin. Defaults to `dev`. Set this to the semver you
  intend to publish.
- `NODE_BASE` — UBI Node base image. Defaults to
  `registry.access.redhat.com/ubi10/nodejs-22:10.1-1775712813` (the
  anonymous mirror — see [ADR-012](adr/012-anonymous-ubi-mirror.md)).
  No Red Hat credentials are needed.
- `NPM_REGISTRY` — for offline / mirrored installs. Defaults to
  `https://registry.npmjs.org/`. If you point this at a private
  registry, the Dockerfile adds the host to Yarn's
  `unsafeHttpWhitelist` automatically.
- `EXTENSIONS_TAG` — the `quay.io/veecode/extensions` OCI tag that
  ships the RHDH `catalog-backend-module-extensions` artifact.
  Defaults to `bs_1.49.4`. See "The `cbme` stopgap" below.
- `YQ_VERSION`, `DECK_VERSION`, `KUBECTL_VERSION` — pinned versions
  for `yq` (config edits at boot), Kong `deck` (scaffolder action),
  and `kubectl` (kubernetes plugin). Bump independently as needed.

## What the image contains

[`Dockerfile`](../Dockerfile) has two stages. Stage 1 (builder) runs
`yarn install` for the root workspace and builds the Backstage backend
bundle. There is no longer a sibling dynamic-plugins workspace —
dynamic plugins are fetched as OCI bundles at boot from
[`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays).
Stage 2 (runtime) is built from the same UBI base and assembles
`/app/`:

```text
/app/
├── packages/backend/                        # Backend bundle
├── dynamic-plugins-root/                    # Empty at build time; populated at boot from OCI
├── presets/                                 # Preset catalog
├── catalog-entities/extensions/             # Marketplace catalog YAMLs (baked-in fallback)
├── app-config.yaml
├── app-config.production.yaml
├── app-config.distro.yaml
├── dynamic-plugins.yaml
├── dynamic-plugins.default.yaml
├── data/extensions-install.yaml             # Marketplace install state; persistent volume, created empty if absent at boot
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

This bites if you bump `EXTENSIONS_TAG` blindly. [`Dockerfile:217-270`](../Dockerfile)
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

When `quay.io/veecode/extensions:bs_1.50.0` (or whatever the current
target is) is published by `devportal-plugin-export-overlays`, set
`EXTENSIONS_TAG=bs_1.50.0` and drop the sed (the Dockerfile comment
spells out the cleanup). See also
[`scripts/dev-run.sh:56-69`](../scripts/dev-run.sh) — it carries the
same patch for the overlay loop.

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

Ports: the image listens on `:7007` (set in
[`app-config.production.yaml`](../app-config.production.yaml)). The
frontend is served from the same port (the backend `app-backend`
plugin serves the bundled frontend at `/`).

Memory: 2 GB is enough to run; less and the heap pressure shows up as
slow startup or eventual GC death under load.

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
matrix build for `amd64` + `arm64`, push per-arch tags
(`<version>-amd64`, `<version>-arm64`), and a final `manifest` job
stitches them under `<version>` and `latest`. See
[`RELEASE_CYCLE.md`](RELEASE_CYCLE.md) for the full procedure.

No Red Hat credentials are required for the publish workflow — UBI
is pulled from the anonymous mirror per ADR-012. The only secrets
needed are `DOCKER_USERNAME` and `DOCKER_PASSWORD`.

## Troubleshooting

**OOM during build** — bump `--memory` and `--memory-swap`, ensure
WSL itself has at least 8 GB allocated to it (`%USERPROFILE%\.wslconfig`).

**`skopeo copy` fails in the Dockerfile's cbme step** — the
`quay.io/veecode/extensions:bs_X.Y.Z` image you set in
`EXTENSIONS_TAG` may not exist yet. Check what
`devportal-plugin-export-overlays` has published; the Dockerfile
emits a warning and continues but the marketplace catalog will be
empty.

**Build cache is too aggressive after a yarn.lock change** —
`docker buildx prune` and rebuild. The Dockerfile is structured so
that `yarn install` reruns only when a manifest changes, but a stale
cache layer can still keep an old lockfile in play.

**`registry.access.redhat.com` rate-limits in CI** — see ADR-012 §
"Anonymous rate limits". Hosted GitHub runners come from a rotating
IP pool, so we haven't seen it bite. If it does, the option is to opt
into `registry.redhat.io` for `publish.yml` specifically (requires
`REDHAT_USER` / `REDHAT_PASS` secrets and a `skopeo login` step).
