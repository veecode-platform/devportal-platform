# Upgrading

`devportal-platform` has three independent upgrade tracks:

1. **Backstage** (`backstage.json`, root resolutions, every `@backstage/*`
   dependency in `packages/{app,backend}`). Dynamic plugin OCI tags
   that pin to a Backstage version (e.g. `bs_${BACKSTAGE_VERSION}`)
   resolve automatically from `backstage.json`; the literal `bs_1.49.4`
   pins in `dynamic-plugins.default.yaml` are updated explicitly when
   a new OCI tag is published upstream.
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
yarn update-backstage      # backstage-cli versions:bump --pattern
                            #   '@{backstage,roadiehq,backstage-community,veecode-platform}/*'
```

Then update [`backstage.json`](../backstage.json) if `versions:bump`
didn't (it should). The file holds a single `{"version": "1.X.Y"}`
that `entrypoint.sh` reads for `BACKSTAGE_VERSION` env-var
substitution in OCI plugin refs. Any literal `bs_<X>.<Y>.<Z>` tags
in `dynamic-plugins.default.yaml` need to be updated by hand once the
matching tag is published by
[`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays);
entries that use `bs_${BACKSTAGE_VERSION}` pick up the new version
automatically.

### Validate

```bash
yarn install               # refresh lockfile
yarn tsc                   # type-check everything
yarn lint:check
yarn test
yarn dev-local             # smoke-test the UI
./scripts/build-local-image.sh  # rebuild the image (optional)
```

### What to expect on a minor bump

- Most peer-dep ranges in `packages/app/package.json` need to be
  bumped too — `versions:bump` covers `@backstage/*` but not always
  `@backstage-community/*` or `@roadiehq/*`. Cross-check.
- Backend plugin re-registration: a new `@backstage/plugin-X-backend`
  module that's now required to be wired explicitly will surface at
  `yarn dev-local` boot as an error.
- The OCI bundles' `supported-versions` field is _just metadata_ —
  it doesn't gate loading. The real compatibility check is whether
  the upstream plugin still imports from the same Backstage subpath
  at the new version, so wait for
  `devportal-plugin-export-overlays` to publish bundles built against
  the new Backstage version before bumping the matching `bs_X.Y.Z`
  tags in `dynamic-plugins.default.yaml`.

### What to expect on a major bump

- The cbme stopgap may need updating (see Track 3).
- The frontend `DynamicRoot/` shell mirrors RHDH's; if RHDH's app
  skeleton changed in the bump (e.g. moved files, renamed
  hooks), our copy needs the equivalent change.
- Run **all** validation, including a container smoke test
  (`./scripts/dev-run.sh run` with a real preset).

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

The Dockerfile pulls the `catalog-backend-module-extensions` artifact from
`quay.io/veecode/extensions:bs_${EXTENSIONS_TAG}` because it's only
distributed as an OCI image (no NPM publish). The artifact is built
by [`veecode-platform/devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays)
on a per-Backstage-version basis.

The current default is `bs_1.49.4`. Separately, the Dockerfile applies a
**catalog-node `/alpha` compat shim** to `node_modules` (re-exports symbols
graduated to the main `@backstage/plugin-catalog-node` export), needed
because the bs_1.49.4 build of the module — and other dynamic plugins —
reference alpha exports that catalog-node 2.2.0 graduated. See § "How to
bump (across the `/alpha` → main shift)" below.

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

`@backstage/plugin-catalog-node` 2.2.0 graduated several symbols
(`catalogProcessingExtensionPoint`, `catalogLocationsExtensionPoint`,
`catalogAnalysisExtensionPoint`, `catalogServiceRef`) from the `/alpha`
subpath export to the package's main entry. Dynamic plugins built against the
older line (the V1 distro shipped catalog-node 2.1.0) still import them from
`/alpha`, where they are now `undefined` → the catalog plugin crashes in
`BackendInitializer`. This is handled centrally by the **plugin-catalog-node
`/alpha` compat shim** in the Dockerfile (re-exports the main entry's symbols
on `/alpha` for any key it no longer carries), which covers every dynamic
plugin importing graduated symbols — the baked
`catalog-backend-module-extensions` and runtime OCI plugins alike.

When every consumed plugin build imports graduated symbols from the main
entry (i.e. is built against catalog-node ≥ 2.2.0 / Backstage 1.50+):

1. Bump `EXTENSIONS_TAG` to the new tag (e.g. `bs_1.50.0`).
2. Remove the `plugin-catalog-node /alpha compat shim` `RUN` block in the
   Dockerfile (the one appending to `dist/alpha.cjs.js`).
3. Verify by rebuilding and confirming the marketplace catalog still loads
   and any GitLab/SCM plugins still boot.

## Post-upgrade checklist

```bash
yarn install
yarn tsc
yarn lint:check
yarn test
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

**OCI plugin fails to load with "module not found"** — the published
bundle was built against a different Backstage version than the one
in `backstage.json`. Either bump `backstage.json` or pin the offending
entry's `bs_X.Y.Z` tag to a known-good version that
`devportal-plugin-export-overlays` has published.

**Image build OOMs at `yarn install` in stage 1** — bump
`--memory=4g --memory-swap=6g` (the floor for a clean build on WSL),
or set `TURBO_CONCURRENCY=1` (already set in Dockerfile).

**Marketplace empty after Backstage bump** — Track 3. Either the
`EXTENSIONS_TAG` is incompatible with the new Backstage core (the
`/alpha` compat shim no longer covers a symbol the module needs — the
build-time shim verify would fail) or the catalog-index OCI image has
not been refreshed (`CATALOG_INDEX_REFRESH=true` to force).

**Backend crashes with "Plugin 'mcp-actions' is already registered"** —
[`packages/backend/src/index.ts:226-229`](../packages/backend/src/index.ts).
You added the MCP backend plugin both statically and via the
dynamic-plugin yaml. Remove the static registration.

## Behavior changes by image version

Boot-contract changes that can affect existing deployments when the
image tag is bumped. Check this list before rolling a new tag into an
environment that was healthy on the previous one.

### Next release (after 2.1.2)

- **Preset composition dependencies are now enforced** (`requires.presets`,
  see [`presets/SCHEMA.md`](../presets/SCHEMA.md)). Compositions that
  previously booted with a broken runtime now refuse to boot with exit 78
  and a corrective message:
  - `mcp-chat` without `mcp` (chat mounted but every tool call 404'd);
  - `ldap-ad` alone or listed before `ldap` (AD overrides silently lost).
  Fix the `VEECODE_PRESETS` order (`mcp,mcp-chat` / `ldap,ldap-ad`).
  `mcp-chat` and `ldap-ad` preset versions were bumped to 2.0.0 to mark
  the contract change.
- **Boot preflight guards** now refuse configurations that previously
  failed late or silently: invalid `VEECODE_APP_CONFIG`, non-writable
  `/app/data`, missing `preInstalled` plugin directories, unresolved
  `${...}` placeholders in enabled plugin refs. A corrupted
  `extensions-install.yaml` no longer crash-loops — it is quarantined to
  `.bak` and recreated (selections re-sync from the database).
- **Theme env vars removed**: `THEME_DOWNLOAD_URL`, `THEME_CUSTOM_JSON`,
  `THEME_MERGE_JSON`, `PLATFORM_DEVPORTAL_THEME_URL` are ignored with a
  boot WARNING (nothing read the file they wrote on V2 — ADR-011 made
  the theme a dynamic plugin). Favicon vars still work.

## Compatibility matrix

| `devportal-platform` | Backstage | Node | UBI tag                         | EXTENSIONS_TAG |
| -------------------- | --------- | ---- | ------------------------------- | -------------- |
| 0.1.x                | 1.49.4    | 22.x | ubi10/nodejs-22:10.1-1775712813 | bs_1.49.4      |

Update this table when any of these changes.
