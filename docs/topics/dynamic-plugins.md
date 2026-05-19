---
name: dynamic-plugins
description: How dynamic plugins are referenced, pulled from OCI, installed, and merged into the running app at boot.
type: topic
audience: [operator, plugin-author]
related: [presets, plugin-authoring, plugin-packaging, configuration-layering]
---

# Dynamic plugins

## What this is

A dynamic plugin is any plugin loaded at runtime into `/app/dynamic-plugins-root/`
rather than compiled into the application bundle. Static plugins are registered
directly in `packages/backend/src/index.ts` (auth, catalog, scaffolder, search,
notifications, kubernetes backend, permissions, RBAC backend). Everything else —
every UI tab, every optional catalog provider, every CI integration — is dynamic.
The split mirrors the approach used in Red Hat Developer Hub (RHDH), which this
project draws from: a thin static core handles identity and data, and the
feature surface expands entirely through the runtime plugin directory.

The standard delivery vehicle for dynamic plugins is an OCI image layer. Most
optional plugins are built and published by the `devportal-plugin-export-overlays`
pipeline and stored on `quay.io/veecode/`. At container start,
`install-dynamic-plugins.py` (invoked via `install-dynamic-plugins.sh`) fetches
each enabled plugin bundle via `skopeo copy`, extracts the plugin layer into
`/app/dynamic-plugins-root/<selector>/` (where `<selector>` is the substring
after `!` in the OCI ref), and walks its `pluginConfig:` block into the
generated `/app/dynamic-plugins-root/app-config.dynamic-plugins.yaml`.

Five chrome plugins — `veecode-homepage`, `veecode-global-header`,
`about-backend`, `about`, and `dynamic-plugins-info` — ship **pre-installed
and always-on**: they are extracted into the image at build time, carry the
bare npm package name in `dynamic-plugins.default.yaml`, and have no
`disabled:` field (default-false). Two more entries are pre-installed but
ship `disabled: true`: the original RHDH `extensions` frontend (kept as a
reference, never enabled by any preset), and `catalog-backend-module-extensions`
(enabled only by the `recommended` preset).

## The plugin inventory

`dynamic-plugins.default.yaml` is the canonical list of every optional plugin
this image knows about. Every entry ships with `disabled: true`. No optional
plugin is on by default; the image boots to a working shell with only the
pre-installed chrome plugins visible.

Presets flip `disabled: false` for the plugins they enable. Critically, the
`pluginConfig:` block (mount points, dynamic routes, RBAC scope declarations,
menu items) stays in `dynamic-plugins.default.yaml`. A preset entry only needs
to carry the `package:` key and `disabled: false` — `install-dynamic-plugins.py`
merges records shallow by `package:` key, so the default's `pluginConfig:`
attaches automatically. This means adding a new preset for an existing plugin is
a ~3-line YAML addition.

Do not add or edit entries directly in `dynamic-plugins.default.yaml` if you
only want to enable a plugin for one deployment. That file is image-level
configuration. Use `VEECODE_PRESETS` and a preset file instead, or toggle the
entry at runtime via the marketplace UI (which writes to `extensions-install.yaml`).

## Reference shape

OCI plugin references in `dynamic-plugins.default.yaml` follow this pattern:

```
oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>
```

Three real examples from `dynamic-plugins.default.yaml`:

```yaml
# Kubernetes frontend tab (workspace: backstage, selector: backstage-plugin-kubernetes)
- package: oci://${PLUGIN_REGISTRY}/backstage:bs_1.49.4!backstage-plugin-kubernetes

# RBAC UI (workspace: rbac, selector: backstage-community-plugin-rbac)
- package: oci://${PLUGIN_REGISTRY}/rbac:bs_1.49.4!backstage-community-plugin-rbac

# Marketplace frontend (workspace: marketplace, version-tracked via BACKSTAGE_VERSION)
- package: oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-frontend-dynamic
```

The four parts:

- **`${PLUGIN_REGISTRY}`** — defaults to `quay.io/veecode`; substituted by
  `entrypoint.sh` lines 230–236. Override with `PLUGIN_REGISTRY=registry.internal/veecode`
  to redirect all OCI pulls to an internal mirror without editing YAML.

- **`<workspace>`** — the export-overlays workspace that produced the OCI bundle
  (e.g. `marketplace`, `rbac`, `tech-radar`, `sonarqube`, `backstage`). One
  workspace can bundle multiple plugin packages; the selector picks the one needed.

- **`bs_${BACKSTAGE_VERSION}`** — the OCI tag. `${BACKSTAGE_VERSION}` is
  substituted by `entrypoint.sh` lines 214–224 from `backstage.json`, so a
  Backstage version bump propagates to all references that use the variable form.
  Some entries pin a literal version (e.g. `bs_1.48.4`, `bs_1.49.4`) when the
  plugin hasn't been re-published under the current Backstage tag yet — those
  pins are updated manually as part of the Backstage upgrade track
  (`docs/UPGRADING.md` § Track 1).

- **`!<selector>`** — the specific npm package name inside the OCI bundle. The
  bundle may contain several packages; the selector extracts just one.

Pre-installed chrome plugins use a bare npm package name with no `oci://` prefix
and carry `preInstalled: true`. `install-dynamic-plugins.py` skips the pull step
for these and only merges the `pluginConfig:`.

## Boot sequence

What happens between `docker start` and Backstage accepting requests:

1. **Preset resolver** (`entrypoint.sh` lines 83–160): for each name in
   `VEECODE_PRESETS`, the resolver validates required env vars (exit 78 on
   missing), writes `preset-<name>-plugins.yaml` with the preset's `plugins:`
   list, and rewrites `dynamic-plugins.yaml`'s `includes:` array to reference
   the preset fragments alongside the defaults.

2. **Shadow copy** (`entrypoint.sh` lines 176–202): `dynamic-plugins.default.yaml`
   is copied to `dynamic-plugins.default.resolved.yaml`. The original file may
   be bind-mounted read-only (dev overlay path, Kubernetes ConfigMap); the shadow
   is always writable. All subsequent substitutions operate on the shadow, not
   the source. `dynamic-plugins.yaml`'s `includes:` is rewritten to reference
   `dynamic-plugins.default.resolved.yaml`.

3. **`${BACKSTAGE_VERSION}` substitution** (`entrypoint.sh` lines 204–224):
   `sed` rewrites the version variable in the shadow file and all preset fragment
   files. The value comes from `backstage.json` unless `BACKSTAGE_VERSION` is
   set explicitly in the environment.

4. **`${PLUGIN_REGISTRY}` substitution** (`entrypoint.sh` lines 226–236):
   `sed` rewrites the registry variable across the same file set. Default is
   `quay.io/veecode`.

5. **`install-dynamic-plugins.sh`** (`entrypoint.sh` line 239): invokes the
   Python install script against `/app/dynamic-plugins-root`. For each enabled
   entry the script calls `skopeo copy` to pull the OCI bundle, extracts the
   selector package, and merges the entry's `pluginConfig:` into
   `/app/dynamic-plugins-root/app-config.dynamic-plugins.yaml`. The merge
   walks nested dicts but is **not** last-write-wins: overlapping leaf keys
   with different values raise `InstallException` ("Config key 'x' defined
   differently for 2 dynamic plugins") and abort startup. Pre-installed
   entries skip the pull; only their `pluginConfig:` is merged.

6. **Backend boot**: the Node.js backend starts. Backstage reads
   `app-config.dynamic-plugins.yaml` to discover mount points, dynamic routes,
   and RBAC scopes for each installed plugin.

7. **Loaded plugins endpoint**: once the backend is up, loaded plugins are
   surfaced at `/api/dynamic-plugins-info/loaded-plugins` (backed by the
   `internal-plugin-dynamic-plugins-info` pre-installed plugin).

## Inspecting what loaded

```bash
TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' \
  | jq -r '.backstageIdentity.token')

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins | jq
```

The response is a JSON array of objects with `name`, `version`, `platform`,
and `role`. `role` is `frontend-plugin`, `backend-plugin`, or
`backend-plugin-module`; `platform` is `web` or `node`.

```json
[
  { "name": "backstage-community-plugin-rbac", "version": "0.6.2",
    "platform": "web", "role": "frontend-plugin" },
  { "name": "devportal-marketplace-frontend-dynamic", "version": "1.2.0",
    "platform": "web", "role": "frontend-plugin" }
]
```

Useful filters:

```bash
# Count loaded plugins
curl -sH "Authorization: Bearer $TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins | jq 'length'

# List backend-only plugins (both backend-plugin and backend-plugin-module)
curl -sH "Authorization: Bearer $TOKEN" \
  http://localhost:7007/api/dynamic-plugins-info/loaded-plugins \
  | jq '[.[] | select(.role | startswith("backend"))] | map(.name)'
```

If a plugin you expected to load is absent, check the container logs for
`install-dynamic-plugins` output — it logs each package as `Installing`,
`Skipped` (pre-installed), or an error line.

## Common failure modes

### Registry unreachable — skopeo error in logs

Symptom: container logs show `Could not resolve plugin` or a `skopeo copy`
error mentioning a timeout or TLS failure. The plugin directory under
`/app/dynamic-plugins-root/` does not exist.

Cause: the image cannot reach `quay.io/veecode` (air-gapped network, proxy
misconfiguration, outage).

Fix: mirror the OCI bundles to an internal registry and set
`PLUGIN_REGISTRY=registry.internal/veecode`. The entrypoint substitutes that
value into every `oci://${PLUGIN_REGISTRY}/...` reference before the install
script runs — no YAML editing needed. See the **Mirror** entry under
"Distribution modes" below.

### Backend crash: "Plugin `<id>` is already registered"

Symptom: the backend process exits immediately with a message like
`Plugin 'mcp-actions' is already registered`.

Cause: the plugin is registered both statically in
`packages/backend/src/index.ts` **and** enabled as a dynamic plugin. The
backend deduplication check is strict; the second registration aborts startup.
The comment at `packages/backend/src/index.ts:232` documents this exact
situation for `mcp-actions`: it was deliberately **not** statically registered
to leave the dynamic path open.

Fix: remove the static `backend.add(import(...))` call for that plugin. If the
plugin must remain static (it needs guaranteed-early initialization), disable
the dynamic entry in `dynamic-plugins.default.yaml` and all preset fragments
that reference it.

### `package:` key mismatch — plugin installs twice or `pluginConfig:` missing

Symptom: `install-dynamic-plugins.py` installs a plugin, but its UI routes or
mount points are missing. Or the backend crashes on startup because two copies
of the same plugin were installed.

Cause: `install-dynamic-plugins.py` merges records **shallow per `package:` key**.
If a preset's `package:` string differs from `dynamic-plugins.default.yaml` even
slightly — whitespace, a version pin, capitalization, or a literal registry
hostname vs the `${PLUGIN_REGISTRY}` variable form — the installer treats them as
two distinct entries. The preset entry installs the plugin bytes without the
`pluginConfig:` from the default; the default entry then installs a second copy
with the config.

The shadow-file mechanism (step 2 of the **Boot sequence** above) prevents the
most common form of this mismatch: before the shadow existed, a preset's resolved
`oci://quay.io/veecode/rbac:...` never matched the default's still-templated
`oci://${PLUGIN_REGISTRY}/rbac:...`, so the merge always missed. Since the shadow
copy is substituted before the install runs, both sides resolve to the same string
and the merge works correctly.

If you author a preset manually, copy the `package:` value verbatim from
`dynamic-plugins.default.yaml` including the `${PLUGIN_REGISTRY}` and
`${BACKSTAGE_VERSION}` variables. Do not pre-substitute them in the preset file.
This failure mode is tracked in `docs/ROADMAP_BACKLOG.md` under
"`dynamic-plugins.yaml` is rewritten in place".

## Distribution modes

Three modes are supported by design (ADR-010 § "Distribution modes"):

### Default — runtime OCI pull

The image ships with no optional plugin bytes. At boot, `install-dynamic-plugins.py`
pulls each enabled plugin from `quay.io/veecode/<workspace>:<tag>` via `skopeo`.
This is the default for cloud and SaaS environments where outbound registry access
is available. No operator configuration is needed beyond `VEECODE_PRESETS`.

### Mirror — internal registry

Set `PLUGIN_REGISTRY=registry.internal/veecode` (or any registry prefix that
mirrors `quay.io/veecode`). The entrypoint (`entrypoint.sh` lines 230–236)
substitutes the value into every `oci://${PLUGIN_REGISTRY}/...` reference before
the install script runs. No YAML files need to be edited. The mirror must host
the same workspace/tag paths as the public registry.

### Loaded variant — air-gapped image

For environments with no outbound registry access at runtime, operators build a
derived image:

```dockerfile
FROM veecode/devportal-platform:<tag>
# Extract selected plugins from OCI bundles at build time
RUN ...
COPY extracted-plugins/ /app/dynamic-plugins-root/
```

Plugins extracted at build time should carry `preInstalled: true` in the
`dynamic-plugins.default.yaml` entry so the install script skips the pull and
only merges the `pluginConfig:`. The published `veecode/devportal-platform` image
stays generic; pre-baked variants are the operator's responsibility. VeeCode does
not maintain a catalog of pre-baked image variants.
