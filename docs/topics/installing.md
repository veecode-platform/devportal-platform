---
name: installing
description: Get from "I want to try this" to a running devportal-platform with a preset enabled in under 30 minutes.
type: topic
audience: [operator]
related: [env-vars]
---

# Installing devportal-platform

The image `docker.io/veecode/devportal-platform` is a single Backstage
distribution. You pass `VEECODE_PRESETS=…` and the env vars each preset
requires; the entrypoint resolves presets, pulls OCI plugin bundles, and
starts Backstage. There is no Helm chart or installer binary needed for
local evaluation. The quickest possible start is in the
[README.md](../../README.md) at the repo root.

## Prerequisites

- Docker (any recent version; tested on Docker Engine 24+ and Docker
  Desktop 4+).
- Optional: Python 3.12 and `pip install -r python/requirements.txt` for
  local TechDocs generation. Nothing else is required.

## The simplest possible run

```sh
docker run --name devportal -d -p 7007:7007 \
  docker.io/veecode/devportal-platform:latest
```

No presets. The entrypoint will print
`VEECODE: no presets selected (VEECODE_PRESETS unset) — booting image defaults only`
(see `entrypoint.sh:158`) and start Backstage with guest auth, a sample
catalog, and only the core chrome plugins. Open `http://localhost:7007`
to see the empty portal.

> Memory note: the Node process needs ~2 GB RSS at steady state. On
> WSL2 or a constrained host, add `--memory=4g --memory-swap=6g` to
> avoid an OOM kill.

## Adding the recommended preset and VeeCode theme

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme \
  docker.io/veecode/devportal-platform:latest
```

`recommended` enables: marketplace, RBAC UI, tech-radar, and a
pending-changes widget. `veecode-theme` applies the VeeCode brand palette
and logos over the default Backstage UI. Both are listed with their full
plugin sets in the `shipped-presets` reference.

## Adding an integration

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme,github \
  -e GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxx \
  -e GITHUB_ORG=my-org \
  docker.io/veecode/devportal-platform:latest
```

The `github` preset wires GitHub OAuth, a catalog provider reading
`catalog-info.yaml` from `GITHUB_ORG`, and the GitHub integration. Other
integrations (`gitlab`, `keycloak`, `azure`, `ldap`, `kubernetes`,
`sonarqube`, `jenkins`) follow the same pattern — pick the preset, supply
its required vars. The `shipped-presets` reference lists every preset's
required env vars.

## What to expect at boot

Boot takes approximately 60–90 seconds. The sequence:

**1. Preset resolver** (`entrypoint.sh:83–160`)

```
VEECODE: preset resolver — VEECODE_PRESETS=recommended,veecode-theme,github
VEECODE: applying preset "recommended"
VEECODE: applying preset "veecode-theme"
VEECODE: applying preset "github"
VEECODE: dynamic-plugins.yaml includes → [...]
```

If a required variable is missing you will see an exit 78 error at this
point instead (see "Common boot failures" below).

**2. Plugin installation**

`install-dynamic-plugins.sh` runs next and calls `skopeo` to pull each
enabled plugin's OCI bundle from `quay.io/veecode` (or your configured
`PLUGIN_REGISTRY`). You will see lines like:

```
INFO: Installing plugin oci://quay.io/veecode/rbac:bs_1.49.4__latest!...
INFO: Plugin installed successfully
```

The number of lines scales with how many presets you enabled.

**3. Healthcheck**

Once Backstage is up, verify with:

```sh
curl -sf http://localhost:7007/healthcheck && echo OK
```

This typically returns `OK` (HTTP 200) within 90 seconds of `docker run`.
If it times out, check `docker logs devportal` for errors.

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

## Common boot failures

### Exit 78 — missing required variable

```
ERROR: the selected preset(s) require variables that are not set:
  - Preset "github" requires GITHUB_PAT. Personal Access Token ...
Set them via the environment or $VEECODE_APP_CONFIG and restart.
```

The error names the preset and the variable. Add the missing `-e VAR=…`
flag and re-run. The full list of what each preset requires is in the
`shipped-presets` reference and in `presets/<name>.yaml`
(`requires.variables`). `env-vars.md` covers all platform-level variables.

### Exit 137 or OOM kill

```
Exited (137)
```

Docker OOM-killed the container. The Node process needs headroom. Add
memory limits:

```sh
docker run ... --memory=4g --memory-swap=6g ...
```

This is mainly a concern on WSL2 and low-memory CI runners. Production
Kubernetes deployments typically do not need explicit limits because the
node has enough headroom.

### Skopeo failure — registry unreachable

```
Could not resolve plugin oci://quay.io/veecode/rbac:...
```

The container cannot reach `quay.io`. In air-gapped or mirror
environments, set `PLUGIN_REGISTRY` to point at your internal mirror:

```sh
-e PLUGIN_REGISTRY=registry.internal/veecode
```

The entrypoint substitutes `${PLUGIN_REGISTRY}` into every plugin OCI
ref before `install-dynamic-plugins.sh` runs (`entrypoint.sh:226–234`).
The full PLUGIN_REGISTRY behavior is documented in `env-vars.md`.

## Common operations

### Restarting to pick up an env change

```sh
docker rm -f devportal
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=... \
  docker.io/veecode/devportal-platform:latest
```

`docker restart devportal` re-runs the entrypoint and re-resolves
presets, but env vars set at `docker run` time are frozen in the
container spec. Use `docker rm -f` + `docker run` to change env vars.

### Mounting a custom app-config overlay

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme \
  -v $(pwd)/app-config.local.yaml:/app/app-config.local.yaml:ro \
  docker.io/veecode/devportal-platform:latest
```

`/app/app-config.local.yaml` loads last in the merge chain
(`entrypoint.sh:276`), after preset configs and distro defaults, so
any key you set there wins. See `env-vars.md` for `VEECODE_APP_CONFIG`
(base64-encoded alternative to a bind-mount).

### Inspecting which plugins loaded

```sh
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' \
  | jq -r '.backstageIdentity.token')

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins \
  | jq '[.[] | .name]'
```

### RBAC policy

The image ships a default `rbac-policy.csv` with admin, developer, and
viewer roles. To override it per-deployment, mount a custom CSV and point
`RBAC_POLICY_PATH` at it. Full coverage is in a future `rbac` topic.

## Related topics

- **env-vars** (reference) — complete table of every variable the image
  reads at boot, with source-file citations.
- **Presets** — the preset model (tiers, composition, `requires.variables`,
  authoring a new preset) will be covered in a forthcoming `presets` topic.
- **Configuration layering** — how `--config` files deep-merge and how to
  override specific keys without touching the base configs will be covered
  in a forthcoming `configuration-layering` topic.
