# Upgrading

`devportal-platform` has three independent upgrade tracks:

1. **Backstage** (`backstage.json`, root resolutions, every `@backstage/*`
   dependency in `packages/{app,backend}` and `dynamic-plugins/`).
2. **UBI base image** (`NODE_BASE` build-arg, currently
   `registry.access.redhat.com/ubi10/nodejs-22:10.1-…`).
3. **`EXTENSIONS_TAG`** — the OCI tag of `quay.io/veecode/extensions`,
   the upstream source for `catalog-backend-module-extensions` and
   the marketplace assets.

Each can be bumped on its own. Cross-coordination is required only
when a Backstage major lands that breaks the cbme module (see
"`EXTENSIONS_TAG` and Backstage" below).

## Track 1: Backstage core

### Current state

- Pinned: **1.49.4** ([`backstage.json`](../backstage.json) and
  resolutions in the root [`package.json`](../package.json)).
- The 1.50 migration is **deferred** (see [`adr/011-frontend-design-system.md`](adr/011-frontend-design-system.md)
  § Phase 2 — gated on NFS `@public`, RHDH publishing a Scalprum→NFS
  path, and `@backstage/frontend-dynamic-feature-loader` leaving
  experimental).
- `EXTENSIONS_TAG` currently points at `bs_1.49.4`; some wrappers
  reference `supported-versions: 1.50.0` (Backstage CLI metadata, not
  the runtime pin).

### Check breaking changes before bumping

- [Backstage releases](https://github.com/backstage/backstage/releases)
- [Upgrade helper](https://backstage.github.io/upgrade-helper/)
- Skim the RHDH dynamic-plugin contract notes; we mirror their app
  skeleton, so a change in `DynamicRoot`/`createApp` flow will land
  here too.

### Run the bump

```bash
# Root workspace
yarn update-backstage      # backstage-cli versions:bump --pattern
                            #   '@{backstage,roadiehq,backstage-community,veecode-platform}/*'

# dynamic-plugins workspace (separate Yarn project)
cd dynamic-plugins
yarn update-backstage      # rm -rf wrappers/*/dist-dynamic wrappers/*/dist-scalprum then versions:bump
cd ..
```

Then update [`backstage.json`](../backstage.json) if `versions:bump`
didn't (it should). The file holds a single `{"version": "1.X.Y"}`
that `entrypoint.sh` reads for `BACKSTAGE_VERSION` env-var
substitution in OCI plugin refs.

### Validate

```bash
yarn install               # refresh lockfile
yarn tsc                   # type-check everything
yarn lint:check
yarn test
yarn dev-local             # smoke-test the UI
make full                  # rebuild dynamic-plugin bundles
./scripts/build-local-image.sh  # rebuild the image (optional)
```

### What to expect on a minor bump

- Most peer-dep ranges in `packages/app/package.json` need to be
  bumped too — `versions:bump` covers `@backstage/*` but not always
  `@backstage-community/*` or `@roadiehq/*`. Cross-check.
- Backend plugin re-registration: a new `@backstage/plugin-X-backend`
  module that's now required to be wired explicitly will surface at
  `yarn dev-local` boot as an error.
- The dynamic-plugin wrappers' `supported-versions` field is _just
  metadata_ — it doesn't gate loading. The real compatibility check
  is whether the upstream plugin still imports from the same
  Backstage subpath at the new version.

### What to expect on a major bump

- `dynamic-plugin/wrappers/*/dist-dynamic` and `dist-scalprum` are
  removed by `yarn update-backstage` in that workspace; rebuild from
  scratch.
- The cbme stopgap may need updating (see Track 3).
- The frontend `DynamicRoot/` shell mirrors RHDH's; if RHDH's app
  skeleton changed in the bump (e.g. moved files, renamed
  hooks), our copy needs the equivalent change.
- Run **all** validation, including `make full` and a container
  smoke test (`./scripts/dev-run.sh run` with a real preset).

## Track 2: UBI base image

### Why bump

Red Hat publishes patched UBI images regularly (CVE fixes in dnf
packages, Node patch versions). The newest tag carries the freshest
security baseline.

### Find the latest tag

```bash
skopeo list-tags docker://registry.access.redhat.com/ubi10/nodejs-22 \
  | jq -r '.Tags[]
           | select(startswith("10.1-"))
           | select(endswith("-source") | not)' \
  | sort -V \
  | tail -n 1
```

(We pull from `registry.access.redhat.com` — anonymous mirror, see
[`adr/012-anonymous-ubi-mirror.md`](adr/012-anonymous-ubi-mirror.md).
The tag stream is identical to the authenticated `registry.redhat.io`.)

### Update the Dockerfile

```dockerfile
# Dockerfile
ARG NODE_BASE=registry.access.redhat.com/ubi10/nodejs-22:10.1-<NEW_RELEASE>
```

That's the only line that needs to change for a patch bump. For a
_minor_ UBI bump (e.g. 10.1 → 10.2), also re-verify that the dnf
package names in stages 1 and 2 still resolve (Red Hat occasionally
renames or repackages between minors).

### Validate

```bash
./scripts/build-local-image.sh
docker run --rm veecode/devportal-platform:local node --version
docker run --rm veecode/devportal-platform:local cat /etc/os-release
```

Run a smoke test of the entrypoint:

```bash
VEECODE_PRESETS=recommended ./scripts/dev-run.sh run
./scripts/dev-run.sh logs   # check for skopeo / yq / kubectl issues
```

The most likely surprise is a Python or pip incompatibility — the
runtime stage installs `python3.12` from dnf and pip-installs the
mkdocs deps from [`python/requirements.txt`](../python/requirements.txt).
If the new UBI image's Python toolchain changes, this is where it
breaks.

## Track 3: `EXTENSIONS_TAG`

### Why this exists

[`Dockerfile:217-270`](../Dockerfile) pulls the
`catalog-backend-module-extensions` artifact from
`quay.io/veecode/extensions:bs_${EXTENSIONS_TAG}` because it's only
distributed as an OCI image (no NPM publish). The artifact is built
by [`veecode-platform/devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays)
on a per-Backstage-version basis.

The current default is `bs_1.49.4`. The Dockerfile also patches the
`/alpha` import inside the artifact to fall back to the main
`@backstage/plugin-catalog-node` export — this is the cbme stopgap,
needed because the bs_1.49.4 build of the module references an alpha
export that Backstage 1.50 graduated.

### When to bump

- When `devportal-plugin-export-overlays` publishes a tag matching
  your Backstage version (e.g. once `bs_1.50.0` is available).
- When you want to test a newer marketplace UI / extension model
  ahead of a Backstage core bump.

### How to bump (patch + same Backstage major)

```bash
docker build . \
  --build-arg EXTENSIONS_TAG=bs_1.49.5 \
  -t veecode/devportal-platform:local
```

Or update the default in the Dockerfile:

```dockerfile
ARG EXTENSIONS_TAG=bs_1.49.5
```

Validate the marketplace tab is populated:

```bash
VEECODE_PRESETS=recommended ./scripts/dev-run.sh run
# Open http://localhost:7007 → Marketplace → Catalog tab — should list ~200 plugins.
```

### How to bump (across the `/alpha` → main shift)

This is the cleanup case described in
[`Dockerfile:245-251`](../Dockerfile). When the upstream build of
`catalog-backend-module-extensions` no longer imports from
`@backstage/plugin-catalog-node/alpha`:

1. Bump `EXTENSIONS_TAG` to the new tag (e.g. `bs_1.50.0`).
2. Remove the `sed` patch block in the Dockerfile (lines around 261–266).
3. Also remove the analogous `ensure_cbme_patch` function in
   [`scripts/dev-run.sh:56-69`](../scripts/dev-run.sh) — it self-skips
   if the `/alpha` import is absent, but cleaner to delete.
4. Verify by rebuilding and confirming the marketplace catalog still
   loads.

## Track 4: Dynamic plugin wrappers

Not strictly an upgrade track, but a frequent companion.

```bash
cd dynamic-plugins
yarn install
yarn build
yarn export-dynamic
yarn copy-dynamic-plugins ../dynamic-plugins-root
```

When you bump a wrapper's dep:

```bash
yarn workspace <wrapper-name> up <pkg>@<version>
```

(Inside `dynamic-plugins/`.) Then export and copy.

## Post-upgrade checklist

```bash
yarn install                 # both workspaces
yarn tsc
yarn lint:check
yarn test
make full                    # rebuilds dynamic-plugin bundles
./scripts/build-local-image.sh   # rebuild image
```

For a release:

- Bump `package.json` `version`.
- Commit (`chore: release 0.Y.Z`).
- Tag (`git tag 0.Y.Z`).
- Run the manual publish workflow (`gh workflow run publish.yml -f
version=0.Y.Z`). See [`RELEASE_CYCLE.md`](RELEASE_CYCLE.md).

## Troubleshooting

**`yarn install` fails with peer-dep conflicts** —

```bash
yarn explain peer-requirements
```

Pin via `resolutions:` in the root `package.json`. Stay within
patch/minor on `@backstage/*` resolutions — major resolutions
override every consumer and break wrappers silently.

**Wrapper builds fail with "module not found"** — a deep import the
wrapper used has been moved upstream. Check the wrapped plugin's
changelog. For frontend wrappers, `rhdh-cli plugin export` is
stricter than `janus-cli` about missing peer deps.

**Image build OOMs at `yarn install` in stage 1** — bump
`--memory=4g --memory-swap=6g` (the floor for a clean build on WSL),
or set `TURBO_CONCURRENCY=1` (already set in Dockerfile).

**Marketplace empty after Backstage bump** — Track 3. Either the
`EXTENSIONS_TAG` is incompatible with the new Backstage core (the
`/alpha` patch may have stopped applying) or the catalog-index OCI
image has not been refreshed (`CATALOG_INDEX_REFRESH=true` to
force).

**Backend crashes with "Plugin 'mcp-actions' is already registered"** —
[`packages/backend/src/index.ts:226-229`](../packages/backend/src/index.ts).
You added the MCP backend plugin both statically and via the
dynamic-plugin yaml. Remove the static registration.

## Compatibility matrix

| `devportal-platform` | Backstage | Node | UBI tag                         | EXTENSIONS_TAG |
| -------------------- | --------- | ---- | ------------------------------- | -------------- |
| 0.1.x                | 1.49.4    | 22.x | ubi10/nodejs-22:10.1-1775712813 | bs_1.49.4      |

Update this table when any of these changes.
