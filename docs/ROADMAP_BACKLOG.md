# Roadmap — Backlog

Known technical debt, deferred items, and gotchas to clean up when
the time is right. This is the project's "we know about it but it
isn't blocking" list. The feature direction lives in
[`ROADMAP_FEATURES.md`](ROADMAP_FEATURES.md).

## In code

### `PluginCollection` entities never ingest (upstream gap)

As observed in the `bs_1.49.4` build of `quay.io/veecode/extensions`
(not yet re-verified against the `bs_1.53.0` rebuild the Dockerfile now
pulls): the bundle ships `ExtensionsCollectionProvider.cjs.js` but
`module.cjs.js` only instantiates `ExtensionsPluginProvider` and
`ExtensionsPackageProvider`. `ExtensionsCollectionProvider` is never
registered, so the provider loop never emits `PluginCollection` entities
regardless of how many collection YAMLs are present under
`/app/catalog-entities/extensions/collections/`.

The image bakes collection YAMLs from the catalog index (see
`Dockerfile` "Bake catalog index" block) and `app-config.yaml` lists
`PluginCollection` in the catalog allow-list, but no entities land
because no provider runs.

**Fix path**: this must be corrected upstream in
`devportal-plugin-export-overlays` (or whichever project publishes the
`quay.io/veecode/extensions` OCI). When a fixed build ships, bump
`EXTENSIONS_TAG` — no other change needed here.

As a stopgap, a per-module patch approach (like the catalog-node `/alpha`
compat shim) could register the collection provider, but that patch would
be fragile and is not currently applied.

### The catalog-node `/alpha` compat shim

The Dockerfile pulls `catalog-backend-module-extensions` from
`quay.io/veecode/extensions:bs_1.53.0`, and separately appends a compat
shim to `node_modules/@backstage/plugin-catalog-node/dist/alpha.cjs.js`
that re-exports symbols catalog-node 2.2.0 graduated from `/alpha` to the
main entry (`catalogProcessingExtensionPoint` and siblings). The need for
the shim was established against the `bs_1.49.4`-era bundles and has not
been re-verified against the `bs_1.53.0` rebuilds (the shim is inert if a
module no longer imports from `/alpha`). One shim
covers every dynamic plugin that externalizes `@backstage/plugin-catalog-node`
to the host (peerDependency, not a bundled copy — the standard export
contract; the baked extensions module and gitlab both comply). A plugin
bundling its own catalog-node copy would shadow the host shim, but none
currently do. It replaced the earlier per-module `sed` patch (and the
`ensure_cbme_patch` in `scripts/dev-run.sh`, both removed). See the shim
`RUN` in the Dockerfile.

**Cleanup path** ([`UPGRADING.md`](UPGRADING.md) § Track 3):
when every consumed plugin build imports graduated symbols from the main
entry, bump `EXTENSIONS_TAG` and remove the shim `RUN` block.

**Optional hardening** (only if we start ingesting third-party OCI plugins
outside the export pipeline): the host shim does not cover a plugin that
bundles its own `@backstage/plugin-catalog-node` copy with the symbol missing
from `/alpha` (Node resolves the plugin-local copy first). All current plugins
externalize it as a peerDependency, so this is not a live risk. A guard would
be an image smoke that boots such a plugin and asserts
`require('@backstage/plugin-catalog-node/alpha').catalogProcessingExtensionPoint`
resolves from inside it.

### `customResolveDynamicPackage` error path

[`packages/backend/src/index.ts:71-103`](../packages/backend/src/index.ts)
implements wrapper-deps resolution. The catch branch on line 93 calls
`this.logger.error(…)`, but the surrounding object literal isn't a
class — `this` likely isn't bound where it's expected. The path fires
only when resolving a wrapper's wrapped package fails, so it isn't
exercised in normal startup, but it's worth a closer look (probably
should be the outer `logger` parameter).

### Authentication module override flag

`ENABLE_AUTH_PROVIDER_MODULE_OVERRIDE` ([`packages/backend/src/index.ts:220`](../packages/backend/src/index.ts))
is a poorly-documented escape hatch. A customer who needs a custom
auth-provider module sets this to skip our `authProvidersModule` and
load their own. Should be documented in
[`CONFIGURATION_GUIDE.md`](CONFIGURATION_GUIDE.md) or removed in
favour of a cleaner extension point.

### GitHub org transformers disabled

[`packages/backend/src/index.ts:146-152`](../packages/backend/src/index.ts)
documents that a custom GitHub org transformer was wired and then
disabled because the GitHub API doesn't return email for GitHub
Apps. Either remove the import altogether or wire it in a way that
no-ops gracefully when the field is missing.

## In CI

### PR check doesn't build the image

[`.github/workflows/pr-check.yml`](../.github/workflows/pr-check.yml)
runs tsc / lint / test on `main`-targeted PRs. It does **not** run
`docker build .`. Dockerfile-only breakage surfaces at publish time.

The previous `build-check.yml` workflow was dropped in commit
47aa652 as part of this docs-refresh cycle (separate decision; the
build was too expensive to run on every PR). A lighter image-smoke
job (e.g. a `docker build . --build-arg DEVPORTAL_VERSION=ci-smoke`
without push, just on Dockerfile/scripts/presets path changes) would
catch most regressions.

### Manual-dispatch publishing

The `publish.yml` workflow is `workflow_dispatch`-only by design
([`RELEASE_CYCLE.md`](RELEASE_CYCLE.md) § "Switching to tag-driven").
This is fine for the current cadence. Tag-driven publishing should
land before the project starts shipping to external consumers.

### Security scan referenced workflow doesn't exist

[`.github/workflows/security-scan.yml:13`](../.github/workflows/security-scan.yml)
triggers on `workflow_run` from the `build-backend-image` workflow,
which **does not exist** in this repo. The trigger is dead code; the
scheduled cron and manual dispatch paths work.

Either rename the trigger to `Publish` (the actual workflow name) or
remove the `workflow_run` block.

### No GitHub Release object on publish

`publish.yml` pushes the image but doesn't create a GitHub Release
or upload `CHANGELOG.md`. Manual step today. The
[`scripts/generate-release-notes.sh`](../scripts/generate-release-notes.sh)
helper produces release notes but isn't wired in.

## In documentation

### ADRs 001–010 not drafted in this repo

The decisions are observable in the code (Scalprum, static/dynamic
plugin split, the unified image + preset catalog) and are referenced
in [`adr/011-frontend-design-system.md`](adr/011-frontend-design-system.md)'s
"Related decisions" section. Drafting the missing ADR-010 in
particular would put a name on the foundational shift from
base/distro to a unified image.

### Notion docs not mirrored

A running design backlog lives in Notion. The docs in this folder
should not duplicate it — but a one-line pointer here ("see the
Notion DevPortal Platform board for in-flight design") would help an
outsider find the rest of the story.

## In testing

### Coverage is low

[`CLAUDE.md`](../CLAUDE.md) § "Testing Strategy" says "test as you
go, don't backfill". That's the stance, but it means several
high-value test surfaces are bare:

- The preset resolver in `entrypoint.sh` (shell — would need bats or
  a docker-driven test harness).
- The custom `customResolveDynamicPackage` wrapper-deps walk in
  `packages/backend/src/index.ts`.
- `install-dynamic-plugins.py` — installs / merges / re-emits config
  and the integration is observable but the script itself is
  untested in this repo.

Adding a small `tests/preset-resolver.bats` (or similar) for the
boot-time invariants (missing required var → exit 78; preset chain
appended to includes; etc.) would harden the most fragile path.

## Skipped tests / xfails

None tracked in this repo as `.skip` / `xfail` markers today. If
this list starts growing, the right place to capture them is here
with a removal condition.
