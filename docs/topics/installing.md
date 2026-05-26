---
name: installing
description: Get from "I want to try this" to a running devportal-platform with a preset enabled in under 30 minutes.
type: topic
audience: [operator]
related: [presets, configuration-layering, env-vars]
---

# Installing devportal-platform

## What this is

The image `docker.io/veecode/devportal-platform` is a single Backstage
distribution. You pass `VEECODE_PRESETS=…` and the env vars each preset
requires; the entrypoint resolves presets, pulls OCI plugin bundles, and
starts Backstage. There is no Helm chart or installer binary needed for
local evaluation. The quickest possible start is in the
[README.md](../../README.md) at the repo root.

## Prerequisites

- Docker Engine 24+ with the `compose` plugin (Docker Desktop 4+ already
  ships it; on a bare engine install, `docker compose version` should
  print a v2 release).
- Optional: Python 3.12 and `pip install -r python/requirements.txt` for
  local TechDocs generation. Nothing else is required.

## The standard operator flow

Two files at the repo root drive every deployment:

- `docker-compose.yml` — service definition, named volumes, the
  bind-mount slot for an operator plugin override.
- `.env.example` — the catalog of variables every preset declares,
  pre-grouped by preset and commented. Copy it once.

```sh
cp .env.example .env
# Edit .env: set VEECODE_PRESETS and the vars each selected preset needs.
docker compose up -d
docker compose logs -f devportal
```

The minimal `.env` to bring the portal up:

```env
VEECODE_PRESETS=recommended,veecode-theme
```

`recommended` enables the marketplace, RBAC UI, tech-radar, and a
pending-changes widget. `veecode-theme` applies the VeeCode brand
palette and logos. Open `http://localhost:7007` to see the result.

### Why volumes matter

`docker-compose.yml` declares two named volumes that are not optional
in practice — they make every restart cheap and preserve the operator's
state across upgrades:

- `dp-data` (mounted at `/app/data`) — Backstage SQLite databases plus
  `extensions-install.yaml` (the marketplace's write-through state).
  Without it, every restart wipes the catalog cache and any
  marketplace-installed plugin.
- `dp-plugins` (mounted at `/app/dynamic-plugins-root`) — the OCI
  plugin bundles that `install-dynamic-plugins.py` downloads at boot.
  Without it, every restart re-fetches every enabled plugin from
  `quay.io` (~60–90s).

The legacy `docker run` flow predates these volumes; it still works but
sacrifices restart speed and marketplace persistence. Compose is the
supported path.

## Adding an integration

Add presets to `VEECODE_PRESETS` and the vars they declare to the same
`.env` file. For GitHub-as-SCM plus GitHub-as-identity:

```env
VEECODE_PRESETS=recommended,veecode-theme,github,github-auth
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=my-org
GITHUB_AUTH_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_AUTH_CLIENT_SECRET=xxxxxxxxxxxx
```

The catalog separates SCM and identity along a deliberate axis so you
can mix providers — e.g. `gitlab,github-auth` puts your code on GitLab
and your login on GitHub. Other integrations (`gitlab`, `keycloak`,
`azure`, `azure-auth`, `ldap`, `ldap-ad`, `kubernetes`, `sonarqube`,
`jenkins`) follow the same preset+env-vars pattern; the
`shipped-presets` reference lists every preset's required env vars.

Apply changes with:

```sh
docker compose up -d
```

Compose detects the env change and recreates the container. The image
is unchanged — presets are env-driven config resolved at boot, never
baked into the image.

## What to expect at boot

Boot takes approximately 60–90 seconds (cold) or 15–30 seconds (warm
restart with `dp-plugins` populated). The sequence:

**1. Preset resolver** (`entrypoint.sh`)

```
VEECODE: preset resolver — VEECODE_PRESETS=recommended,veecode-theme,github
VEECODE: applying preset "recommended"
VEECODE: applying preset "veecode-theme"
VEECODE: applying preset "github"
VEECODE: dynamic plugin includes → [...]
```

If a required variable is missing, or the selected presets violate an
exclusive group, you will see an `ERROR:` line with exit 78 at this
point instead (see "Common boot failures" below).

**2. Plugin installation**

`install-dynamic-plugins.py` runs next and calls `skopeo copy` to pull
each enabled plugin's OCI bundle from `quay.io/veecode` (or your
configured `PLUGIN_REGISTRY`). You will see lines like:

```
======= Installing dynamic plugin oci://quay.io/veecode/rbac:bs_1.49.4!backstage-community-plugin-rbac
        ==> Successfully installed dynamic plugin oci://quay.io/veecode/rbac:bs_1.49.4!backstage-community-plugin-rbac
```

The number of lines scales with how many presets you enabled.

**3. Healthcheck**

Once Backstage is up, verify with:

```sh
curl -sf http://localhost:7007/healthcheck && echo OK
```

This typically returns `OK` (HTTP 200) within 90 seconds of
`docker compose up -d`. If it times out, check
`docker compose logs devportal` for errors.

**4. Inspect loaded plugins**

The `dynamic-plugins-info` backend plugin exposes a
`/api/dynamic-plugins-info/loaded-plugins` endpoint. It requires a
Backstage identity token:

```sh
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' \
  | jq -r '.backstageIdentity.token')

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins | jq .
```

The response is a JSON array of every plugin the image loaded at boot.

### Known boot-log noise

Three lines appear on every healthy boot. They read like errors; they
are not platform bugs.

- `skipping '/app/dynamic-plugins-root/app-config.dynamic-plugins.yaml' since it is not a directory` — Backstage scanning the dynamic-plugins-root for directory-style plugin configs; the file it skips is the merged config, not a plugin directory.
- `==> WARNING: skipping file containing link outside of the archive: …/mime/cli.js` (typically ×4) — upstream tarball symlinks in some plugin bundles; the symlinks aren't needed at runtime.
- `(node:1) [DEP0040] DeprecationWarning: The 'punycode' module is deprecated.` — Node deprecation in an upstream Backstage dependency.

If you grep `docker compose logs` for `WARNING` or `error` and only
these appear, the boot is healthy.

### `docker compose up -d` exits 0 even on container failure

If the entrypoint exits 78 (any of the failure modes below), `docker
compose up -d` still prints `Container … Started` and returns exit code
0. The compose CLI reports successful *creation*, not successful *boot*.

For CI and scripted deployments, always pair `up -d` with a status
check:

```sh
docker compose up -d
docker compose ps -a --format '{{.Service}}\t{{.State}}\t{{.ExitCode}}'
```

A row with `State=exited` and `ExitCode=78` is a fail-fast boot — read
`docker compose logs` for the named error.

## Common boot failures

### Exit 78 — missing required variable

```
ERROR: the selected preset(s) require variables that are not set:
  - Preset "github" requires GITHUB_PAT. Personal Access Token ...
Set them via the environment or $VEECODE_APP_CONFIG and restart.
```

The error names the preset and the variable. Add the missing entry to
`.env` and run `docker compose up -d` again. The full list of what
each preset requires is in the `shipped-presets` reference and in
`presets/<name>.yaml` (`requires.variables`). `env-vars.md` covers all
platform-level variables.

### Exit 78 — exclusive group conflict

```
ERROR: presets "github-auth" and "keycloak" belong to the exclusive group "identity" and cannot be selected together.
       Select only one identity preset: github-auth, azure-auth, gitlab, keycloak, ldap.
```

Two presets that share an `exclusive_group` value were both listed in
`VEECODE_PRESETS`. Today the only defined group is `identity` (one
sign-in provider can be active at boot). The entrypoint runs this
check before any download starts, so the error appears within a
second of `docker compose up -d`. Edit `.env` to keep one identity
preset and rerun.

### Exit 137 or OOM kill

Docker OOM-killed the container. The Node process needs ~2 GB RSS at
steady state and a bit more during startup. On WSL2 or constrained
hosts, add the limit to `docker-compose.yml`:

```yaml
services:
  devportal:
    # ...
    mem_limit: 4g
    memswap_limit: 6g
```

This is mainly a concern on WSL2 and low-memory CI runners. Production
Kubernetes deployments typically do not need explicit limits because
the node has enough headroom.

### Exit 78 — plugin install failure

```
======= ERROR: Failed to install plugin oci://quay.io/veecode/rbac:bs_1.49.4!backstage-community-plugin-rbac:
        ==> Skipping this plugin and continuing with the rest...
…
======= INSTALL SUMMARY: 7 of 12 plugins failed:
        - oci://quay.io/veecode/rbac:bs_1.49.4!backstage-community-plugin-rbac: <error>
        - …
Set DYNAMIC_PLUGINS_TOLERATE_FAILURES=true to allow partial installs.
```

One or more dynamic plugins failed to install (typically: `quay.io`
unreachable, a typo'd OCI ref, or `PLUGIN_REGISTRY` pointing at a
registry that doesn't mirror all bundles). At HEAD `649e2c8` and later,
the install script collects every failure, prints a summary, and exits
78. The entrypoint propagates that exit code so the container does not
boot in a half-installed state.

Common causes:

- **`quay.io` unreachable.** Air-gapped or proxied environments. Set
  `PLUGIN_REGISTRY=registry.internal/veecode` in `.env` so every
  `oci://${PLUGIN_REGISTRY}/…` ref resolves to your mirror. The
  entrypoint substitutes the variable into every OCI ref before the
  install runs.
- **Typo in an operator overlay.** A bogus OCI ref in your bind-mounted
  `dynamic-plugins.yaml` will fail to pull and the boot aborts. Fix the
  ref and rerun.
- **Mirror missing a bundle.** Your mirror has some plugins but not all.
  Push the missing bundle, or remove the plugin from your preset set.

If you knowingly want partial installs (dev iteration, deliberately
tolerated upstream flake), set `DYNAMIC_PLUGINS_TOLERATE_FAILURES=true`
in `.env`. The summary still prints, but the boot proceeds with
whichever plugins did install. **Do not use this in production** —
it's exactly the silent-half-installed-portal mode the exit-78 contract
exists to prevent.

## Common operations

### Picking up an env change

```sh
docker compose up -d
```

Compose compares the current container spec (which freezes env at
creation time) against the new `.env` and recreates the container if
they differ. No image rebuild, no plugin re-download (the `dp-plugins`
volume already has them).

`docker compose restart devportal` does **not** re-read `.env` — it
just restarts the process inside the existing container. Use `up -d`
for env changes.

### Refreshing the catalog index

The marketplace catalog (~220 plugin YAMLs) is baked into the image at
build time, so the default cold boot does not hit the network for it
— you'll see `Catalog entities already present, skipping download` in
the log. To force a fresh pull from
`quay.io/veecode/plugin-catalog-index:latest` (or whatever
`CATALOG_INDEX_IMAGE` points at):

```env
CATALOG_INDEX_REFRESH=true
```

The freshly-downloaded layer is extracted over the baked content;
nothing else changes. Adds ~3 s to boot. Useful when the upstream
catalog ships a new entry you want before the next image rebuild;
otherwise leave it `false` and let the image-level bake handle it.

### Mounting a custom app-config overlay

Add a bind-mount under `volumes:` in `docker-compose.yml`:

```yaml
    volumes:
      - dp-data:/app/data
      - dp-plugins:/app/dynamic-plugins-root
      - ./app-config.local.yaml:/app/app-config.local.yaml:ro
```

`/app/app-config.local.yaml` loads after the distro defaults and the
preset configs, so it overrides anything a preset set. (The generated
dynamic-plugins app-config and, on SaaS, `app-config.saas.yaml` load
after it.) See `env-vars.md` for `VEECODE_APP_CONFIG` (base64-encoded
alternative to a bind-mount).

### Operator plugin override

For the platform-installer persona — toggling plugins on/off or pinning
a different version than what a preset wires — edit
`dynamic-plugins.yaml` at the repo root (it ships as `plugins: []` with
inline instructions and is bind-mounted by the compose file by default),
then:

```sh
docker compose restart devportal
```

Use `restart` rather than `up -d`: Compose does not see edits to
bind-mounted file content, so `up -d` will print `Running` without
re-running the entrypoint.

The plugins listed there compose with the preset's plugins. The
contract and merge rules are in the `presets` topic. Plugins with both
a frontend and a backend package (e.g. `tech-radar` →
`backstage-community-plugin-tech-radar` and
`backstage-community-plugin-tech-radar-backend`) need an entry per
package to fully toggle.

### RBAC policy

The image ships a default `rbac-policy.csv` with admin, developer, and
viewer roles. To override it per-deployment, mount a custom CSV and
point `RBAC_POLICY_PATH` at it. Full coverage is in a future `rbac`
topic.

## Related topics

- [`env-vars`](../reference/env-vars.md) — full env var reference
- [`presets`](presets.md) — what presets are, the tier model, composition rules
- [`configuration-layering`](configuration-layering.md) — how `app-config.*.yaml` files merge at boot
