---
name: configuration-layering
description: How app-config.*.yaml files merge at boot, including preset configs, mounted overrides, and the SaaS path.
type: topic
audience: [operator]
related: [presets, env-vars]
---

# Configuration layering

## What this is

Backstage's native config system merges multiple `--config` files in the order
they are supplied. The merge is deep (object keys are combined) and last-wins on
scalar values: if two files set the same leaf key, the later file's value
survives. The platform's entrypoint assembles the `--config` chain at boot from
base distribution files, preset-generated files, and operator-supplied
overrides. Understanding the chain tells you exactly where to put a setting and
why it takes effect (or why it doesn't).

## The precedence chain

Entries are listed lowest to highest priority. A file loaded later wins on any
overlapping key.

| Order | File | When loaded |
|-------|------|-------------|
| 1 | `app-config.yaml` | Base distribution defaults |
| 2 | `app-config.production.yaml` | Container/production overrides |
| 3 | `app-config.distro.yaml` | VeeCode distro defaults (~10 lines, escape hatch) |
| 4 | `app-config.preset-<name>.yaml` | One per selected preset, in `VEECODE_PRESETS` order |
| 5 | `app-config.local.yaml` | Operator overrides (volume mount or `VEECODE_APP_CONFIG` base64) |
| 6 | `dynamic-plugins-root/app-config.dynamic-plugins.yaml` | Generated at boot from each plugin's `pluginConfig:` |
| 7 | `app-config.saas.yaml` | SaaS-time overrides (database URL, etc.) |

Files 1–3 are always present inside the image. File 4 is emitted for each
preset in `VEECODE_PRESETS` (a preset with no `appConfig:` block produces no
file). Files 5–7 are conditional: each is skipped if absent.

Source of truth: `entrypoint.sh` lines 257–267 (the comment block) and the
`EXTRA_ARGS` construction that follows.

## Variable substitution

Any value in any config file may contain `${VAR}` or `${VAR:-default}`.
Backstage resolves these from the process environment at startup, after all
`--config` files are merged. Rules:

- `${VAR}` — replaced with the env value; if the var is unset, resolved to an
  empty string (Backstage does not error).
- `${VAR:-default}` — replaced with the env value if set; falls back to
  `default` otherwise.
- If a preset declares a variable as `required: true`, the entrypoint validates
  it before Backstage starts. A missing required var exits with code 78, so
  substitution never runs on an incomplete environment. See
  [presets](presets.md) for the full validation flow.

Substitution applies equally to all files in the chain. If two files both
reference `${DATABASE_URL}`, both see the same resolved value — the chain
position only controls which file's _containing key_ wins, not the substitution
outcome.

## The two operator paths

The image supports two first-class configuration paths.

**Preset path.** Set `VEECODE_PRESETS=recommended,github` (or whichever
combination you need). The entrypoint enables the relevant plugins, generates
`app-config.preset-<name>.yaml` for each, and validates required env vars. You
then supply the env vars those presets require. Any per-deployment tuning goes
into `app-config.local.yaml` (position 5 in the chain), which wins over all
preset-generated configs. See [presets](presets.md) for the preset contract and
schema.

**Raw Backstage path.** Skip `VEECODE_PRESETS` entirely. Mount your own
`app-config.local.yaml` (or use `VEECODE_APP_CONFIG`) carrying the full
Backstage config for the integrations you want. Files 1–3 still load (they set
safe defaults like guest auth and local SQLite), but nothing else is added
automatically.

Both paths compose. You can use presets for most settings and still mount a
`app-config.local.yaml` for the few keys you want to override.

## The `VEECODE_APP_CONFIG` base64 env

In chart-managed deployments (Helm, ArgoCD) where you cannot mount a file into
the container, encode your operator config as base64 and pass it as
`VEECODE_APP_CONFIG`. The entrypoint decodes it into
`/app/app-config.saas.yaml` before starting Backstage:

```sh
# entrypoint.sh ~line 168
if [ ! -z "$VEECODE_APP_CONFIG" ]; then
    echo "$VEECODE_APP_CONFIG" | base64 -d > /app/app-config.saas.yaml
fi
```

Because the decoded file lands at position 7 (last in chain), it wins over
everything — preset configs, plugin configs, and any mounted `local.yaml`. Use
it for deployment-specific values (database URLs, ingress hosts, secret
references) that must not be hardcoded in the image or a ConfigMap.

To encode:

```bash
base64 -w0 my-operator-config.yaml
```

Pass the output as the `VEECODE_APP_CONFIG` environment variable (via a
Kubernetes Secret or Helm `--set`).

For the full env-var reference, see [env-vars](../reference/env-vars.md).

## Common operations

### Mount your own `app-config.local.yaml`

```bash
docker run \
  -v $(pwd)/app-config.local.yaml:/app/app-config.local.yaml:ro \
  <image>
```

The file occupies position 5 in the chain and wins over preset-generated
configs. You do not need to replicate anything from earlier files — only supply
the keys you want to override or add.

### Override a single preset value

Suppose the `github` preset enables the GitHub catalog provider at a 30-minute
refresh frequency. You want 5 minutes. In your `app-config.local.yaml`:

```yaml
catalog:
  providers:
    github:
      default:
        schedule:
          frequency: { minutes: 5 }
```

Backstage deep-merges this over the preset-generated config. Because
`app-config.local.yaml` loads after all preset files, your `frequency` value
wins. You do not need to repeat the rest of the provider block.

### Inspect the resolved chain at boot

```bash
docker logs <container> 2>&1 | grep -E "EXTRA_ARGS|preset"
```

`entrypoint.sh` prints the assembled `EXTRA_ARGS` string before handing off to
Node. This shows exactly which `--config` flags are passed and in what order.

### Verify a setting took effect

Backstage does not expose a stock "merged config" endpoint. Two practical
verifications:

1. **Check the boot logs** — many keys (catalog providers, auth providers,
   integration tokens) emit a `Found N config(s)` or `Configured for ...` line
   on startup. Tail `docker logs <container>` after the boot completes.

2. **Test the behavior** — hit the API or UI surface the key controls (e.g. for
   a `catalog.providers.github` change, watch the catalog refresh tick and check
   that the new schedule applies). For an auth provider, attempt sign-in.

If the observed behavior differs from what you put in your config file, check
the chain order — a file loaded later may be winning — or whether var
substitution resolved differently than expected.

## Related topics

- [presets](presets.md) — the preset model, required env vars, and how preset
  configs are generated
- [env-vars](../reference/env-vars.md) — full list of env vars the entrypoint
  and presets recognise
- [dynamic-plugins](dynamic-plugins.md) — how `app-config.dynamic-plugins.yaml`
  (position 6) is generated and what it contains
