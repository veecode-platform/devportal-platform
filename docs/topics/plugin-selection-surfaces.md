---
name: plugin-selection-surfaces
description: How a plugin is selected and loaded — the four surfaces, their precedence, and operator decision tree.
type: topic
audience: [operator]
related: [dynamic-plugins, presets, configuration-layering]
---

# Plugin selection — the four surfaces and their precedence

How a plugin ends up installed in your DevPortal involves four independent
surfaces: a catalog that declares *what is available*, and three surfaces that
operators use to *select what is enabled*. This is the map.

## Why this page exists

Operators new to the image often ask: "I see this plugin in the preset, but I
also see it in the marketplace, and I can toggle it in `dynamic-plugins.yaml`.
Which one wins?" The answer is: it depends on the order they are applied at
boot, and the order is not obvious from the files alone. This document is the
operator's reference for which surface to use and what happens when surfaces
conflict.

## The vitrine (catalog)

`dynamic-plugins.default.yaml` is the catalog — a list of every optional
plugin this image knows about. Editing it changes what *is available* to be
selected, not what *is enabled*. The file ships with every entry marked
`disabled: true`. No optional plugin is on by default; the image boots with only
the pre-installed chrome plugins visible.

The catalog is a reference for plugin authors and image maintainers. **Do not
edit this file to enable a plugin for one deployment.** Use one of the three
selection surfaces below instead. For the rationale and the relationship between
the catalog and the marketplace UI, see [ADR-013](../adr/013-plugin-catalog-model.md).

## Surface 1 — Presets (`VEECODE_PRESETS`)

Presets are the recommended surface for most operators. A preset is a YAML file
in `presets/<name>.yaml` that bundles three things: required environment
variables, the dynamic plugins to enable, and the configuration those plugins
expect. Select presets at runtime via the `VEECODE_PRESETS` environment
variable: `VEECODE_PRESETS=recommended,github`.

The preset resolver runs before the backend starts. For each selected preset:

1. **Validates required variables** — any `requires.variables` entry marked
   `required: true` must be set in the environment; missing vars fail the boot
   with exit 78 and name the missing var.
2. **Writes a plugin fragment** — if the preset's `plugins:` list is non-empty,
   the resolver writes `/app/preset-<name>-plugins.yaml` and adds it to the
   includes chain.
3. **Writes an app-config fragment** — if the preset's `appConfig:` block is
   non-empty, the resolver writes `/app/app-config.preset-<name>.yaml` and
   passes it to Backstage as a `--config` file.

Presets compose: you can stack them — `VEECODE_PRESETS=recommended,github,keycloak`
— and they layer as you'd expect. Plugin lists merge shallow per `package:` key;
app-config blocks deep-merge. If two presets enable the same plugin, the *last
preset in the list wins* (the later one's `pluginConfig` or `disabled` field
overrides the earlier one's). See [topics/presets.md](presets.md) for composition
rules and the shipped preset catalog.

## Surface 2 — Operator override (`dynamic-plugins.yaml` `plugins:`)

This is the manual, fine-grained surface. Operators can mount a
`dynamic-plugins.yaml` file (read-only bind mount in Kubernetes, or via `docker run -v`)
and declare a top-level `plugins:` list with entries they want enabled or disabled.

The entrypoint copies the mounted file to a shadow (`/app/dynamic-plugins.resolved.yaml`)
and rebuilds the `includes:` chain on every boot. The shadow's `plugins:` entries
are preserved. When the install script runs, both included preset entries and the
operator's `plugins:` list are merged shallow per `package:` key. **The operator's
`plugins:` entries are processed *after* all includes**, so they win on conflicts.

This surface is best for the **platform-installer persona** — someone iterating
on plugin choices during trial-and-error. Because `plugins:` is processed last
in the merge chain, toggling `disabled: true/false` here always takes precedence
over preset fragments.

The operator's `includes:` list (if present in the mounted file) is intentionally
replaced by the entrypoint. Do not rely on it; the entrypoint manages the includes
chain to ensure a deterministic order.

## Surface 3 — Marketplace UI

The in-portal marketplace UI (`/extensions/marketplace`) allows end users to
install and uninstall plugins without restarting the container. This surface
requires the `recommended` preset (which enables the marketplace plugin itself).

When a user installs a plugin via the marketplace:

1. The marketplace backend writes the installation record to the database.
2. The marketplace backend regenerates `/app/data/extensions-install.yaml` from
   the database state and commits it atomically (temp-file + rename, which is
   why `/app/data` **must be a directory volume**, not a single-file bind mount).
3. On the next container restart, the entrypoint includes
   `/app/data/extensions-install.yaml` in the plugin includes chain, and the
   install script reads it alongside presets and operator overrides.

This file **survives container restarts**, so plugin selections made via the UI
persist across boots as long as the `/app/data` volume is retained.

## Precedence rules

When multiple surfaces enable or disable the same plugin, the outcome is
determined by the order the install script processes them. The entrypoint
constructs the includes chain on every boot like this:

```
includes:
  - dynamic-plugins.default.resolved.yaml
  - /app/data/extensions-install.yaml
  - preset-recommended-plugins.yaml
  - preset-github-plugins.yaml
  - (any others, in VEECODE_PRESETS order)
```

The install script (`install-dynamic-plugins.py`) processes includes in order,
then processes the top-level `plugins:` list from `dynamic-plugins.yaml` last.
For each plugin, the merge is **shallow per `package:` key**: the first entry
for a given `package:` value is placed in `allPlugins`, and subsequent entries
override its fields (lines 463–478 in `install-dynamic-plugins.py`):

```python
def mergePlugin(plugin: dict, allPlugins: dict, dynamicPluginsFile: str):
    package = plugin['package']
    if package not in allPlugins:
        allPlugins[package] = plugin
        return
    # override the included plugins with fields in the main plugins list
    print('\n======= Overriding dynamic plugin configuration', package, flush=True)
    for key in plugin:
        if key == 'package':
            continue
        allPlugins[package][key] = plugin[key]
```

**Precedence summary** (from lowest to highest):

| Conflict scenario | Winner | Mechanism |
|---|---|---|
| Default catalog disables plugin, preset enables it | preset enables | preset-*.yaml processed after default.resolved.yaml |
| Preset A enables plugin, preset B enables same plugin | last preset wins | preset-B-plugins.yaml processed after preset-A-plugins.yaml |
| Preset enables plugin, marketplace UI disables it | depends on timing | marketplace writes extensions-install.yaml at runtime; included before presets in chain, so preset override wins **unless** marketplace re-disables on next boot |
| Preset enables plugin, operator `dynamic-plugins.yaml` disables it | operator disables | top-level `plugins:` processed last |
| Marketplace enables plugin, operator `dynamic-plugins.yaml` disables it | operator disables | as above |
| Same plugin enabled with two different OCI refs | **boot fails, exit 78** | duplicate-detector (see section below) |

For "off no matter what" semantics: explicitly set `disabled: true` in
`dynamic-plugins.yaml`. Do not rely on the absence of an entry to disable a
plugin; a preset or the marketplace might re-enable it.

## The duplicate-detector

If the same plugin appears in the enabled set with two different `package:` OCI
references, the boot fails with exit 78 and prints both refs. This is a
guard-rail against a common operator mistake: enabling a plugin both via a
preset and via a manual catalog edit, or receiving the same plugin from two
different workspaces or versions.

Example failure:

```
Duplicate dynamic plugin 'backstage-plugin-kubernetes' enabled with
conflicting refs:
  oci://quay.io/veecode/backstage:bs_1.49.4!backstage-plugin-kubernetes
  oci://quay.io/veecode/backstage:bs_1.48.4!backstage-plugin-kubernetes

Both install the same Module Federation bundle. Enable it once with a single ref
(copy the canonical ref from dynamic-plugins.default.yaml), or disable one entry.
```

See `docker/install-dynamic-plugins.py` lines 494–518 (`check_plugin_identity_collisions`)
for the identity-detection logic. The identity is the `!<selector>` part of an OCI
ref, or the npm package name for non-OCI entries. This check runs *before*
installation, so the boot fails cleanly rather than silently loading the plugin
twice.

## The deferred unification

The catalog model today is split: `dynamic-plugins.default.yaml` (this repo, ~33
entries, hand-maintained) and the marketplace's `plugin-catalog-index` OCI image
(~125 packages + entities, auto-generated by the `devportal-plugin-export-overlays`
pipeline). The two share content but live independently. Editing one does not sync
the other.

This creates operator friction: "where do I add a plugin?" has different answers
depending on whether you want it to appear in the marketplace UI or be available
via preset. The target end-state — a single unified vitrine — is deferred. Until
then, operators must understand that the marketplace catalog and
`dynamic-plugins.default.yaml` are independent artifacts.

For the decision rationale and the unification constraints, see [ADR-013](../adr/013-plugin-catalog-model.md).

## Decision tree (operator-facing)

Use this tree to pick the right surface for your situation:

- **Want to enable plugin X for everyone?** → Use a preset. Define or select a
  preset that includes X; set `VEECODE_PRESETS`. See [presets.md](presets.md).
- **Want to enable plugin X for only one deployment?** → Use operator override.
  Mount `dynamic-plugins.yaml`, add X to the `plugins:` list with
  `disabled: false`. Bind-mount the file read-only; the entrypoint makes it
  writable.
- **Want end users to opt in per-instance?** → Use marketplace UI. Requires
  `VEECODE_PRESETS=recommended` (or a preset that includes the marketplace
  plugin). Users then navigate to `/extensions/marketplace` and install/uninstall
  at will. State survives restarts.
- **Plugin is in the catalog but not loading?** → Check that at least one surface
  has enabled it. Catalog entries default to `disabled: true`; being listed does
  not mean it loads. Trace the includes chain logged at boot:
  `VEECODE: dynamic plugin includes → [...]`.

---

**Learn more:**
- [`topics/presets.md`](presets.md) — composing and authoring presets.
- [`topics/dynamic-plugins.md`](dynamic-plugins.md) — how plugins are pulled,
  installed, and registered at boot.
- [`topics/configuration-layering.md`](configuration-layering.md) — the
  Backstage `app-config` merge order (separate from plugin selection).
- [`adr/013-plugin-catalog-model.md`](../adr/013-plugin-catalog-model.md) —
  the deferred unification decision and constraints.
