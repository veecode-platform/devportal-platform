# Consuming OCI Dynamic Plugins

DevPortal Platform loads dynamic plugins from OCI (Open Container Initiative) registries at startup. This allows adding plugins without rebuilding the Docker image.

## How it works

1. A preset (or `dynamic-plugins.yaml` directly) references an OCI image
2. At startup, `docker/install-dynamic-plugins.py` uses `skopeo` to pull the image
3. The plugin is extracted to `/app/dynamic-plugins-root/`
4. Frontend plugins are loaded by Scalprum, backend plugins by Node

## OCI package URL formats

Two formats exist. Both are read by the same installer and can be mixed freely.

### One image per plugin (current, ADR-008 phase 3)

```
oci://<registry>/<plugin-repo>:<tag>
```

- `<registry>/<plugin-repo>` — the image IS the plugin; no selector needed
- `<tag>` — a pinned `bs_<line>__<plugin-version>` tag (e.g. `bs_1.52.0__0.1.14`), or the literal placeholder `{{inherit}}` (see caveat below — **not usable in this repo's presets today**)

The plugin's directory name inside the image is auto-detected from the image's `io.backstage.dynamic-packages` manifest annotation (falls back to the image's own repo name if that annotation is absent).

```
oci://quay.io/veecode/backstage-plugin-mcp-actions-backend:bs_1.52.0__0.1.14
```

#### `{{inherit}}` — not usable in preset files today

A ref tagged `{{inherit}}` defers to whatever concrete tag the same image is pinned to elsewhere in the merged plugin set (see `resolve_inherit_refs()` in `docker/install-dynamic-plugins.py`) — but only if something in the `includes:` chain actually carries that pin.

`entrypoint.sh` builds the runtime `includes:` chain from `extensions-install.yaml` (marketplace state) plus the enabled presets' own `plugins:` fragments — **`dynamic-plugins.default.yaml` is documentation only and is never included** (see the entrypoint's own "dynamic-plugins.default.yaml is NOT included" comment). So a preset ref tagged `{{inherit}}` has nothing to resolve against and fails the boot with `InstallException: found 0 matching`. **Every OCI ref in `presets/*.yaml` must carry a pinned tag**, not `{{inherit}}`, until a plugin-catalog-index (or similar) is wired into that chain. See [Installer: fork-patched py vs upstream TS](#installer-fork-patched-py-vs-upstream-ts) below.

One consequence: pinned per-plugin tags embed a plugin-specific version (`bs_1.52.0__0.1.14`), which — unlike the old `bs_${BACKSTAGE_VERSION}!<selector>` refs — cannot be templated off `${BACKSTAGE_VERSION}` alone. A preset ref pinned this way needs a manual edit whenever that plugin (not just the Backstage line) bumps.

### Workspace bundle with a selector (legacy, still supported — and still the templatable form)

```
oci://<registry>/<image>:<tag>!<plugin-directory>
```

- `<registry>/<image>` — full OCI image path (e.g. `${PLUGIN_REGISTRY}/rbac`)
- `<tag>` — image tag, commonly `bs_${BACKSTAGE_VERSION}` or a pinned `bs_1.49.4`
- `!<plugin-directory>` — directory name inside the OCI layer where the plugin files live

One OCI image bundles several plugins from the same workspace; each is extracted by its `!<plugin-directory>` suffix. Most presets still use this form specifically because `${BACKSTAGE_VERSION}` templating keeps the ref correct across a Backstage bump with no edit.

```
oci://${PLUGIN_REGISTRY}/rbac:bs_1.49.4!backstage-community-plugin-rbac
```

## Adding an OCI plugin to a preset

Edit `presets/<name>.yaml` and add an entry under `plugins`:

```yaml
plugins:
  # One-image-per-plugin, pinned — required today (see {{inherit}} caveat above)
  - package: oci://quay.io/veecode/my-plugin-backend:bs_1.52.0__1.0.0
    disabled: false

  # Legacy workspace bundle + selector — still fully supported, templatable
  - package: oci://${PLUGIN_REGISTRY}/my-workspace:bs_${BACKSTAGE_VERSION}!my-plugin
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          my-org.plugin-name:
            mountPoints:
              - mountPoint: entity.page.overview/cards
                importName: MyComponent
```

See [`presets/README.md`](../presets/README.md) and [`presets/SCHEMA.md`](../presets/SCHEMA.md) for the full preset file schema.

## Pull policy

| Policy | Behavior | Default for |
|--------|----------|-------------|
| `IfNotPresent` | Skip download if already installed | Most packages |
| `Always` | Always check for updates | Tags ending with `:latest!` |

Override per plugin:

```yaml
- package: oci://registry/image:tag!dir
  disabled: false
  pullPolicy: Always
```

**Caveat for pinned refs:** the `Always` default only triggers on the literal substring `:latest!` in the raw `package` string. A pinned per-plugin tag (`bs_1.52.0__0.1.14`) correctly defaults to `IfNotPresent` — it's already immutable, nothing to re-check. This only matters if a ref is ever pointed at a genuinely moving tag (e.g. a bare `bs_1.52.0` line tag with no plugin-version suffix) — set `pullPolicy: Always` explicitly on that entry.

## Installer: fork-patched py vs upstream TS

Upstream RHDH's own dynamic-plugin installer was rewritten from a single Python script into a multi-file TypeScript module (`redhat-developer/rhdh-plugins`, `workspaces/install-dynamic-plugins/`). That rewrite is where genuine `{{inherit}}` support (`merger.ts::resolveInherit`) and per-plugin-image auto-detection (`oci-key.ts`, keyed off the `io.backstage.dynamic-packages` manifest annotation) both originate.

`docker/install-dynamic-plugins.py` in this repo is still the old vendorized Python script — there is no Python original upstream to diff against anymore, so adopting the TS installer here would mean porting a ~2,500-line, ~40-file module from scratch, not merging a patch. That cost, plus this fork's own hardening the TS rewrite doesn't have (duplicate-plugin-identity and duplicate-`pluginId` boot checks, the `preInstalled` directory guard, per-plugin install-failure tracking), made a full port disproportionate to the immediate need.

**Decision (ADR-008 phase 3):** ship a minimal, targeted patch to the existing Python installer instead — `resolve_inherit_refs()` and the bare-ref auto-detect described above — matching the upstream mechanism's *semantics* without its implementation. Adopting the TS installer wholesale remains a real option and is tracked as a follow-up, not ruled out.

**Known duality this creates (per the ADR-008 phase 3 decision context — not verified against chart code from this repo):** VeeCode's tenant deployments are understood to run the upstream RHDH TS installer via their Helm chart; devportal-distro and devportal-platform (this repo and its sibling) run this fork-patched Python script. If that's accurate, both now understand `{{inherit}}` and one-image-per-plugin refs, but via two independent implementations that must be kept in sync by hand if the ref format changes again — there is no shared code between them.

**Why `{{inherit}}` only works on devportal-distro today:** devportal-distro's `dynamic-plugins.yaml` includes `dynamic-plugins.default.yaml`, which carries pinned per-plugin refs — a real base to inherit from. This repo's presets have no equivalent `includes:` entry (see the caveat above), so `{{inherit}}` here would fail every boot. Wiring a plugin-catalog-index (or similar) into the preset `includes:` chain would unlock `{{inherit}}` — and with it, templated pins again — for presets too.

## Troubleshooting

### Plugin not appearing in UI

1. Check logs for `Successfully installed dynamic plugin oci://...`
2. Verify `pluginConfig` mount points are correct for frontend plugins
3. Some plugins only show on entities with specific annotations

### `Cannot resolve {{inherit}} for '...'`

The ref uses `{{inherit}}` but the installer found zero or more than one matching pinned entry for that image in the merged plugin set. On this repo, that almost always means the ref is in a preset — presets have no `includes:` base to inherit from (see above); use a pinned tag instead.

### Plugin installed but config not applied

The `pluginConfig` is only merged when the plugin is actually installed (not skipped). If you change `pluginConfig` after the first install, restart the container to force a fresh install.
