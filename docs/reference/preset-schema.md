---
name: preset-schema
description: Complete YAML schema for preset files, including frontmatter, requires, plugins, appConfig, and composition rules.
type: reference
audience: [operator, plugin-author]
related: [shipped-presets]
---

# Preset schema

A preset is a YAML document with the following top-level fields.

## Top-level fields

```yaml
name: string                    # required, kebab-case
description: string             # required, one-line summary
version: semver                 # required, e.g. "1.0.0"

requires:                       # optional, default: empty
  variables: {}

plugins:                        # optional, default: []
  - { ... }

appConfig:                      # optional, default: {}
  ...
```

### `name`

Kebab-case identifier (`github`, `azure-devops`, `kong`). Used by
`VEECODE_PRESETS` env var to select. Must be unique across the
preset catalog.

### `description`

One-line human-readable summary. Used in CLI output and log lines.

### `version`

Semver (`1.0.0`). Bump when the preset's contract changes:

- **patch** — typo, doc tweak, plugin patch version bump
- **minor** — added an optional variable, added a plugin
- **major** — removed/renamed a required variable, removed a plugin

Operators pin against major versions when they care about stability.

## `requires.variables`

Map of env var name → metadata:

```yaml
requires:
  variables:
    GITHUB_PAT:
      description: Personal Access Token with repo + read:org scopes
      required: true
      docs: https://docs.github.com/...
      example: ghp_xxxxxxxxxxxxxxxxxxxx
```

**Fields:**

- `description` (required) — what this variable is and why
- `required` (required) — `true` if absent var fails the boot, `false`
  if it's optional
- `docs` (optional) — URL pointing to provider documentation for
  generating/finding the value
- `example` (optional) — example value for the docs (NEVER a real
  secret — use clearly-fake placeholders)

**Validation behavior at boot:**

The entrypoint reads all loaded presets, collects every `required: true`
variable, and checks the process env. If any required variable is
unset OR set to empty string, the entrypoint exits with code 78 (config
error) and prints:

```
Preset "github" requires GITHUB_PAT. Set it via env or
  $VEECODE_APP_CONFIG. See https://docs.github.com/...
```

## `plugins`

Array of plugin entries, identical in shape to entries in
`dynamic-plugins.yaml`:

```yaml
plugins:
  - package: oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-frontend-dynamic
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          devportal.marketplace-frontend: {}
```

**Package reference formats:**

- `oci://<registry>/<workspace>:<tag>!<selector>` — preferred and the
  dominant form; the install script pulls the bundle via skopeo and
  extracts the named selector. `${PLUGIN_REGISTRY}` (default
  `quay.io/veecode`) and `${BACKSTAGE_VERSION}` (default read from
  `backstage.json`) are substituted by `entrypoint.sh` before the
  install runs, so a Backstage bump or a registry mirror swap doesn't
  mean editing every preset.
- `<bare-name>` (no `oci://` prefix) — used for plugins that are
  pre-installed into `/app/dynamic-plugins-root/` at image build time and
  ship with `preInstalled: true` in `dynamic-plugins.default.yaml`. The
  install script skips pulling these and only merges their `pluginConfig`.
  Pre-installed entries may be **always-on** (no `disabled:` field, e.g.
  `veecode-homepage`, `veecode-global-header`) or **disabled-by-default**
  and gated by a preset (e.g. RHDH `catalog-backend-module-extensions`,
  which `presets/recommended.yaml` flips on).

**`disabled: false` is the preset's intent.** A preset that enables a
plugin must set this. If a preset wants a plugin available-but-off,
it sets `disabled: true` and documents the toggle in the preset's
description.

## `appConfig`

Free-form object merged into the runtime app-config under standard
Backstage rules (last-write-wins on overlapping keys).

```yaml
appConfig:
  integrations:
    github:
      - host: github.com
        token: ${GITHUB_PAT}
  catalog:
    providers:
      github:
        organization: ${GITHUB_ORG}
        schedule:
          frequency: { minutes: 30 }
          timeout: { minutes: 3 }
```

**Variable substitution:** `${VAR_NAME}` is resolved against the process
environment at startup. Unset vars referenced here become empty strings
unless the preset also declares them in `requires.variables` with
`required: true` (in which case validation fails first).

**No business logic.** The `appConfig` is pure configuration, not a
runtime hook. If a preset needs computed values, that computation
happens in the plugin code, not the preset.

## Composition

When the entrypoint loads multiple presets (`VEECODE_PRESETS=a,b,c`):

1. **Required variables are unioned across presets.** A variable required by
   any selected preset is required overall; the resolver exits 78 with a
   combined error message before the backend starts.

2. **Plugins** — each preset's `plugins:` block is written to its own
   `preset-<name>-plugins.yaml` fragment and added to `dynamic-plugins.yaml`'s
   `includes:`. `install-dynamic-plugins.py` then loads each fragment and merges
   per `package` key — **shallow merge, last-write-wins on the entry as a
   whole**. Two presets that reference the same `package:` produce a single
   installation governed by the later preset's `pluginConfig`.

   **Critical contract**: the `package:` field MUST match the entry already
   present in `dynamic-plugins.default.yaml` exactly (the full `oci://…!<selector>`
   form, including any `-dynamic` suffix on the selector). A mismatch installs
   the plugin a second time under a different name and the backend crashes on
   the duplicate registration. See the comments at the top of `recommended.yaml`
   for examples.

3. **`appConfig`** — each preset's `appConfig:` block is written to its own
   `app-config.preset-<name>.yaml` and added to the backend's `--config` list
   in preset order. Backstage's native config loader deep-merges `--config`
   files: object-level merges and scalar last-write-wins on overlapping keys.

## Reserved env var prefixes

To avoid collision between presets, follow the convention:

| Prefix | Owner |
|---|---|
| `VEECODE_*` | platform (image-wide) |
| `BACKSTAGE_*` | upstream Backstage core |
| `<PROVIDER>_*` (`GITHUB_*`, `AZURE_*`, `KEYCLOAK_*`) | preset-specific |

A preset declaring a variable outside its provider namespace is a smell
— either the variable is platform-wide (don't put it in the preset) or
the preset is actually two presets bundled (split it).
