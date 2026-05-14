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
  - package: oci://ghcr.io/veecode-platform/devportal-plugin-export-overlays/backstage-plugin-catalog-backend-module-github:bs_1.49.4__0.13.0!backstage-plugin-catalog-backend-module-github
    disabled: false
    pluginConfig:
      dynamicPlugins:
        backend:
          backstage-plugin-catalog-backend-module-github: {}
```

**Package reference formats:**

- `oci://<registry>/<image>:<tag>!<plugin-name>` — recommended for new
  presets; pulls at runtime, decoupled from image release
- `./dynamic-plugins/dist/<plugin>` — local path, valid only for
  plugins built into the unified image
- `<scope>/<package>@<version>` — npm reference, downloaded at boot

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

1. Required variables are unioned across presets.
2. Plugin lists are concatenated. Duplicate `package` refs are
   deduplicated by last-occurrence (later preset wins on
   `pluginConfig`).
3. `appConfig` blocks are deep-merged in order. Later presets
   override earlier ones on overlapping keys.

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
