# Upgrading from `devportal-base` + `devportal-distro` to `devportal-platform`

This guide is for operators running the **legacy two-image topology**
on Backstage 1.49.x:

- `docker.io/veecode/devportal-base:<tag>` (the lightweight runtime
  built from [`veecode-platform/devportal-base`](https://github.com/veecode-platform/devportal-base)),
  or
- `docker.io/veecode/devportal:<tag>` (the distro built from
  [`veecode-platform/devportal-distro`](https://github.com/veecode-platform/devportal-distro)
  on top of base, with the dynamic-plugin set baked in)

…who want to move to the **unified image**:
`docker.io/veecode/devportal-platform:<tag>`.

This is **not a forced migration.** Both legacy images stay on their
1.49.4 line under maintenance-indefinite ownership (security backports
only). Upgrade when it suits you; rollback is a single config change.

If you are a developer working on the platform codebase itself, see
[`UPGRADING.md`](./UPGRADING.md) for the Backstage-version / UBI /
`EXTENSIONS_TAG` upgrade tracks. **This** file is for operators
consuming the image.

## What changed

The two legacy images collapse into one. The plugin set the distro
baked in is the same plugin set — only now those plugins ship
**disabled by default**, and they're enabled by **presets** the
operator selects at runtime via `VEECODE_PRESETS`.

| Before (legacy) | After (unified) |
|---|---|
| Two images: `veecode/devportal-base` + `veecode/devportal` (the distro that builds on base) | One image: `veecode/devportal-platform` |
| `dynamic-plugins/` workspace built inside the distro at image-build time | Plugins published separately as OCI bundles by [`devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays); resolved at boot via `oci://` refs |
| Auth + integration selected via `VEECODE_PROFILE=<github\|azure\|gitlab\|keycloak\|ldap\|github-pat\|ldap-ad>` (loads one `app-config.<profile>.yaml`) | Same surfaces selected via `VEECODE_PRESETS=a,b,c` (composes). The per-integration preset is intentionally narrower than the legacy all-in-one profile — see the translation table below. |
| Built-in VeeCode look (palette + logos imported statically in `packages/app`) | Same look opt-in via the `veecode-theme` preset (a dynamic plugin) — composable, replaceable by a customer brand |
| Backstage 1.49.x | Backstage 1.49.4 (1.50 still deferred — see [ADR-010 § Migration deferral](./adr/010-unified-image-and-presets.md)) |

The architectural rationale lives in
[ADR-010 — Unified image, preset catalog, OCI dynamic plugins](./adr/010-unified-image-and-presets.md).
[ADR-002 (Base vs distro image)](https://github.com/veecode-platform/devportal-base/blob/main/docs/adr/002-base-vs-distro-image.md)
in `devportal-base` is superseded by it.

## Quick reference

```diff
- image: veecode/devportal:1.3.x          # distro image, all plugins baked
+ image: veecode/devportal-platform:0.1.x # unified image
+ env:
-   VEECODE_PROFILE: github
+   VEECODE_PRESETS: recommended,veecode-theme,github
+   # plus the env vars the github preset requires — see table below
```

Two things to know upfront before you reach the detail:

1. **The image name changes.** The legacy distro image was
   `veecode/devportal`; the platform image is `veecode/devportal-platform`.
   This is not a tag bump — your image reference changes. The
   platform line restarts at `0.1.0` rather than continuing the
   distro's `1.3.x`.
2. **Per-integration presets are narrower than legacy profiles.** A
   legacy profile like `VEECODE_PROFILE=github` carried the whole
   GitHub story: OAuth login, GitHub App integration, org/team
   discovery, repo discovery, the GitHub Actions UI. The platform
   `github` preset carries the **integration** (PAT + repo
   discovery + the GitHub Actions UI) — but not the OAuth sign-in
   provider. The rationale is that authentication is often a
   *different* provider from your SCM (you might host code on GitHub
   and sign in with Keycloak), so coupling them in one preset leaked.
   The translation table below names what each preset includes and
   what you carry over via `app-config.local.yaml`.

## Pre-flight: keep your current config readable

Before you touch anything, copy your current deployment's
`app-config.<profile>.yaml` (and any `app-config.local.yaml`
overrides) somewhere you can reference. For each setting that the
platform preset does **not** cover (see the gap notes in the
translation table), you'll lift those blocks into an
`app-config.local.yaml` mounted into the new image. Backstage's
`--config` precedence (configured in [`entrypoint.sh`](../entrypoint.sh)
lines 257–289) puts your mounted `app-config.local.yaml` **after** the
preset's `appConfig`, so your overrides win without you having to fork
a preset.

If you're on the SaaS-managed VeeCode Platform, the migration is
operator-side (you don't run `docker run`), and there is **no
automatic migration tool today** — track the follow-up in
[`docs/ROADMAP_FEATURES.md`](./ROADMAP_FEATURES.md) §
"Profile-to-preset customer migration tooling".

## Required: `VEECODE_PRESETS=recommended`

The legacy distro image shipped RBAC, marketplace, tech-radar, and
pending-changes **enabled by default**. The unified image ships those
same plugins **disabled by default** and gates them behind the
`recommended` preset. **Every existing deployment must set
`VEECODE_PRESETS=recommended`** to keep the previous experience.

Without it, the image boots a barebones DevPortal — guest auth, the
VeeCode global header (Core tier, always on), the homepage, the About
page, and the sample catalog — but no marketplace, RBAC, tech-radar,
or pending-changes. That is intentional, but it is not what your
existing customers expect.

To match the legacy distro's visual identity as well, add the
`veecode-theme` preset:

```sh
VEECODE_PRESETS=recommended,veecode-theme
```

The `veecode-theme` preset wires the palette, typography, and MUI
component overrides that used to be statically imported in the
distro's `packages/app`. Without it, you still get the VeeCode header
and brand chrome (Core-tier), but not the full palette — see
[ADR-011 § "A minimal VeeCode identity survives without the theme preset"](./adr/011-frontend-design-system.md).

## Profile → preset translation

The table below is the contract. The "Carry over" column names what
your legacy `app-config.<profile>.yaml` covered that the preset does
**not** — those blocks belong in your mounted
`app-config.local.yaml` on the new image.

| Legacy `VEECODE_PROFILE` | New preset (compose with `recommended,veecode-theme`) | Required env vars (per the preset) | Gap — carry over via `app-config.local.yaml` |
|---|---|---|---|
| `github-pat` | `github` | `GITHUB_PAT`, `GITHUB_ORG` | Rename your env var `GITHUB_TOKEN` → `GITHUB_PAT`. No app-config carry-over needed; the legacy `github-pat` profile was guest-auth + PAT integration only. |
| `github` | `github` | `GITHUB_PAT`, `GITHUB_ORG` | The preset does **not** wire the GitHub OAuth sign-in provider, GitHub App-based integration, or the `githubOrg` user/team discovery. Lift the `signInPage`, `auth.providers.github`, `integrations.github[].apps`, and `catalog.providers.githubOrg` blocks from your old `app-config.github.yaml` into `app-config.local.yaml`. |
| `gitlab` | `gitlab` | `GITLAB_HOST`, `GITLAB_AUTH_CLIENT_ID`, `GITLAB_AUTH_CLIENT_SECRET`, `GITLAB_TOKEN`, `GITLAB_GROUP` (plus optional `GITLAB_GROUP_PATTERN`) | None expected — the preset covers OAuth sign-in + integration + catalog org/repo discovery, matching the legacy profile. |
| `azure` | `azure` | `AZURE_DEVOPS_TOKEN`, `AZURE_DEVOPS_HOST`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT` | The preset wires Azure **DevOps** integration + catalog + UI, **not** Microsoft / Azure AD sign-in. If you used the legacy `azure` profile for sign-in, lift the `signInPage: microsoft`, `auth.providers.microsoft`, and `catalog.providers.microsoftGraphOrg` blocks from your old `app-config.azure.yaml` into `app-config.local.yaml`. |
| `keycloak` | `keycloak` | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `AUTH_SESSION_SECRET` | None expected — the preset covers OIDC sign-in + `keycloakOrg` user/group sync, matching the legacy profile. |
| `ldap` | `ldap` | `LDAP_URL`, `LDAP_DN`, `LDAP_SECRET`, `LDAP_USERS_BASE_DN`, `LDAP_GROUPS_BASE_DN` (plus optional `LDAP_USERS_FILTER`, `LDAP_GROUPS_FILTER`) | None expected — the preset's defaults (`usernameAttribute: uid`, OpenLDAP object classes) match the legacy `ldap` profile. |
| `ldap-ad` | `ldap` | Same as `ldap` | The preset ships **OpenLDAP** defaults (`usernameAttribute: uid`, `filter: (objectClass=groupOfNames)`); the legacy `ldap-ad` profile overrode these for Active Directory (`usernameAttribute: sAMAccountName`, `(objectClass=user)` / `(objectClass=group)` filters, plus a richer `map:` for `name`, `description`, `displayName`, `email`, `memberOf`). Lift the `auth.providers.ldap.production.ldapAuthenticationOptions.usernameAttribute` and `catalog.providers.ldapOrg` blocks from your old `app-config.ldap-ad.yaml` (in [`devportal-distro/profiles/`](https://github.com/veecode-platform/devportal-distro/blob/main/profiles/app-config.ldap-ad.yaml)) into `app-config.local.yaml`. |

Presets compose. `VEECODE_PRESETS=recommended,veecode-theme,github,sonarqube`
adds the SonarQube code-quality tab on top of the GitHub stack and
demands the variables for both.

Each preset's full required-variable contract lives in
[`presets/`](../presets) (one YAML per preset) under
`requires.variables`. If a required variable is missing, the
entrypoint exits with code 78 and a message naming the preset and the
variable — diagnose by reading the error, not by guessing.

### New presets the legacy profiles didn't have

The platform ships a few presets that have no legacy-profile
counterpart. They're not on by default; opt in via
`VEECODE_PRESETS` when you want them:

- **`jenkins`** — Jenkins CI tab on entity pages
  (`JENKINS_URL`, `JENKINS_USERNAME`, `JENKINS_TOKEN`).
- **`kubernetes`** — Kubernetes workloads tab on entity pages
  (`K8S_CLUSTER_NAME`, `K8S_CLUSTER_URL`, `K8S_CLUSTER_TOKEN`).
- **`sonarqube`** — SonarQube code-quality tab + scaffolder action
  (`SONARQUBE_BASE_URL`, `SONARQUBE_API_KEY`).
- **`mcp`** — MCP server exposing catalog/scaffolder/techdocs tools
  to external AI clients (Claude Code, Codex CLI, Cursor) via
  OAuth/DCR. No required vars; the OAuth config is baked into the
  image's baseline. See [`presets/mcp.yaml`](../presets/mcp.yaml).
- **`mcp-chat`** — AI Chat inside the portal at `/mcp-chat`.
  **Composes with `mcp`** (talks loopback to the MCP server).
  Requires `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`,
  `MCP_CHAT_MODEL`. See [`presets/mcp-chat.yaml`](../presets/mcp-chat.yaml).

## Step-by-step

### Self-hosted (`docker run` / `docker-compose`)

1. **Pin the image** to `veecode/devportal-platform:0.1.x`. Confirm
   the published tag list on Docker Hub before pinning — at the time
   of writing the publish workflow is manual-dispatch only
   ([`.github/workflows/publish.yml`](../.github/workflows/publish.yml)),
   so available tags depend on what's been cut.
2. **Set `VEECODE_PRESETS=recommended,veecode-theme,<your-integration>`.**
   Drop your existing `VEECODE_PROFILE=<x>` — the platform image
   ignores it.
3. **Set the env vars the preset requires.** Use the variable names
   in the table above; some renamed (`GITHUB_TOKEN` → `GITHUB_PAT`),
   most carry over.
4. **Mount your carry-over `app-config.local.yaml`** if the table
   flagged a gap for your profile. Bind-mount it to
   `/app/app-config.local.yaml` (or pass via the `VEECODE_APP_CONFIG`
   base64 env, which decodes into `/app/app-config.saas.yaml` —
   useful for chart-managed deployments). Both load after the preset
   configs (see the `Config file precedence` comment block in
   [`entrypoint.sh`](../entrypoint.sh)), so your overrides win.
5. **Start the container.** If the boot fails with `Preset "<name>"
   requires <VAR>` and exits 78, the message names the variable.
6. **Hit `/healthcheck`** once the container is up.

```sh
docker run --name devportal -d -p 7007:7007 \
  -e VEECODE_PRESETS=recommended,veecode-theme,github \
  -e GITHUB_PAT=ghp_… \
  -e GITHUB_ORG=my-org \
  -v "$(pwd)/app-config.local.yaml:/app/app-config.local.yaml:ro" \
  veecode/devportal-platform:0.1.0
```

### Helm / Kubernetes

A first-party Helm chart for `devportal-platform` is **not shipped
yet** — track this in
[`docs/ROADMAP_FEATURES.md`](./ROADMAP_FEATURES.md) and
[`docs/ROADMAP_BACKLOG.md`](./ROADMAP_BACKLOG.md). Operators on the
existing VeeCode Helm chart (which targets `devportal-base` /
`devportal`) continue to use that chart against the legacy images
until either a `devportal-platform`-aware chart ships or your
deployment switches to a plain Deployment + ConfigMap pattern
mirroring the `docker run` invocation above.

Specifically, the existing chart's `veecodeProfile:` value has no
direct equivalent on the platform image — you'd set the
`VEECODE_PRESETS` env var via the chart's generic-env-vars escape
hatch, but the chart's Backstage-specific helpers (auth-secret
projection, profile-keyed ConfigMaps) are coupled to the
`veecodeProfile:` model and won't all carry over cleanly. If you
need this path soon, file an issue on the chart repo so the priority
is visible.

## Validation

Once the new image is up:

```sh
# Healthcheck (no auth)
curl -sf http://localhost:7007/healthcheck

# Guest token (the image enables guest auth by default)
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' \
  | jq -r '.backstageIdentity.token')

# List loaded dynamic plugins — your preset's plugins should be here
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins \
  | jq -r '.[].name' | sort
```

The list should include the always-on Core plugins (global header,
homepage, About + backend, dynamic-plugins-info) plus every plugin
your selected presets enable. Counts are configuration-dependent and
shift as the preset catalog evolves — prefer the per-name listing
over a bare number. The smoke harness
[`scripts/smoke-presets.sh`](../scripts/smoke-presets.sh) runs the
same check automatically against each preset.

Quick browser-side checks:

- `/extensions/marketplace` renders and lists the bundled `Plugin`
  and `Package` entities (the marketplace catalog the
  `catalog-backend-module-extensions` ingests at boot). An empty
  marketplace means the module didn't load — check container logs for
  `catalog-backend-module-extensions` load errors.
- The VeeCode header / logo / palette match what the legacy distro
  rendered (if `veecode-theme` is in your preset list).
- The "Installed Packages" tab on any catalog entity page renders.
- Your integration provider syncs on the schedule the preset
  declares — read it from `catalog.providers.<provider>.schedule` in
  the preset's `appConfig` (e.g. every few minutes for GitLab, every
  30 minutes for GitHub, every hour for LDAP).
- If you added `keycloak` / `gitlab` for sign-in, the
  `/api/auth/<provider>/start` flow returns the provider's login
  redirect rather than 404.

## Rollback

The unified image and the legacy distro image use **different image
names** (`veecode/devportal-platform` vs `veecode/devportal`).
Rolling back is therefore a config change, not just a tag swap:

```diff
- image: veecode/devportal-platform:0.1.0
+ image: veecode/devportal:1.3.x
  env:
-   VEECODE_PRESETS: recommended,veecode-theme,github
+   VEECODE_PROFILE: github
```

You can leave any preset-only env vars set when you roll back — the
legacy image ignores variables it doesn't consume. Set
`VEECODE_PROFILE` back to your previous value when you flip the
image.

`veecode/devportal-base` / `veecode/devportal` tags on Docker Hub
remain available; the legacy repos stay in maintenance-only mode
(1.49 security backports) until the 1.49 baseline reaches
end-of-life or a real consumer signals otherwise.

## What is NOT in this migration

This upgrade is **only** the image and configuration-surface change.
It does not include:

- **Backstage 1.50 migration.** Both the legacy 1.3.x distro and
  `devportal-platform:0.1.x` ship on Backstage 1.49.4. The 1.50 bump
  is deferred upstream-style; see
  [ADR-010 § "Migration deferral — Backstage 1.50 bump postponed"](./adr/010-unified-image-and-presets.md).
- **Automated config translation.** No script reads your
  `VEECODE_PROFILE=<x>` and emits the equivalent `VEECODE_PRESETS=…`.
  The translation is documented (this file), not code-supported,
  because the per-integration preset is narrower than the legacy
  profile by design and a 1:1 shim would hide that.
- **SaaS-managed automatic migration.** If you're on the VeeCode
  SaaS platform, your instance is migrated on the operator side —
  no automatic tooling yet. Tracked in
  [`docs/ROADMAP_FEATURES.md`](./ROADMAP_FEATURES.md) §
  "Profile-to-preset customer migration tooling".
- **A first-party Helm chart for `devportal-platform`.** Not
  shipped today; see the § "Helm / Kubernetes" caveat above.
- **Frontend theme change.** The `veecode-theme` preset is a
  repackage of the same palette+logos the legacy distro carried;
  the visual result is equivalent. A redesign would be a separate
  decision under [ADR-011](./adr/011-frontend-design-system.md) §
  Phase 2.

## Where to go for help

- **Preset catalog reference:** [`presets/README.md`](../presets/README.md)
- **Preset schema:** [`presets/SCHEMA.md`](../presets/SCHEMA.md)
- **Why this design:**
  [ADR-010](./adr/010-unified-image-and-presets.md) (the
  unified-image decision) and
  [ADR-011](./adr/011-frontend-design-system.md) (the theme-as-preset
  decision).
- **Configuration layering and the raw Backstage path** (mounting
  your own `app-config.yaml` end-to-end without using presets):
  [`docs/CONFIGURATION_GUIDE.md`](./CONFIGURATION_GUIDE.md) and
  [`presets/README.md` § "Two primary paths of use"](../presets/README.md).
- **Issue tracker:** [`veecode-platform/devportal-platform/issues`](https://github.com/veecode-platform/devportal-platform/issues).
- **Legacy profile YAMLs** (your source of truth for carry-over
  config): [`devportal-base/app-config.<profile>.yaml`](https://github.com/veecode-platform/devportal-base)
  and [`devportal-distro/profiles/`](https://github.com/veecode-platform/devportal-distro/tree/main/profiles).
