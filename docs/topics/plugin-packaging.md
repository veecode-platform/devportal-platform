---
name: plugin-packaging
description: Package an authored plugin as an OCI bundle, publish it, and reference it from devportal-platform.
type: topic
audience: [plugin-author, operator]
related: [plugin-authoring, dynamic-plugins, presets]
---

# Plugin Packaging

## What this is

This topic picks up where [plugin-authoring](plugin-authoring.md) leaves off.
Once you have a working Backstage plugin package with a valid `dist-scalprum/`
export, you need to turn it into an OCI bundle, push it to a registry, and
wire it into the platform image so `install-dynamic-plugins.py` can fetch and
load it at boot.

Two audiences:

- **Plugin authors** — you built the plugin; now you need it distributed.
  You'll add it to the export-overlays pipeline or maintain your own OCI
  push, then open a PR to `devportal-platform` to register the ref.
- **Operators** — you're consuming an already-published bundle. You care about
  the `dynamic-plugins.default.yaml` entry, the preset that enables it, and
  the registry substitution that keeps your environment portable.

What this topic does **not** cover: the TypeScript plugin code itself
(`plugin-authoring`), the full lifecycle once loaded (`dynamic-plugins`), or
the preset composition model (`presets`).

---

## Where the build pipeline lives

The OCI build and publish pipeline lives in
[`veecode-platform/devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays).

That repository:

- Runs `rhdh-cli plugin export` (or the legacy `janus-cli` for older entries)
  against each plugin workspace.
- Produces `dist-scalprum/` layers that the Scalprum Module Federation runtime
  knows how to hydrate.
- Pushes a multi-plugin OCI bundle to `quay.io/veecode/<workspace>:bs_<bsver>`.

Each workspace in that repo produces exactly one OCI image tag. Multiple
plugin packages can live in the same workspace and therefore the same image
tag — the `!<selector>` at the end of an OCI ref identifies which package
inside the bundle to install.

Consult the `devportal-plugin-export-overlays` README for how to add a
workspace, run the export locally, and push to the registry. The internals are
owned by that repo; this document does not duplicate them.

---

## Tag scheme

Every OCI plugin ref in this platform has the form:

```
oci://<registry>/<workspace>:<tag>!<selector>
```

| Segment | Meaning | Example |
|---|---|---|
| `<registry>` | Registry host + org path | `quay.io/veecode` (default) |
| `<workspace>` | Export-overlays workspace name | `jenkins`, `rbac`, `marketplace` |
| `<tag>` | Backstage version the bundle was built against | `bs_1.49.4` |
| `<selector>` | Package name of the specific plugin inside the bundle | `backstage-community-plugin-jenkins` |

**Substitution.** The entrypoint replaces two variables before invoking
`install-dynamic-plugins.py`:

- `${PLUGIN_REGISTRY}` → the value of the `PLUGIN_REGISTRY` env var
  (default: `quay.io/veecode`)
- `${BACKSTAGE_VERSION}` → the value of the `BACKSTAGE_VERSION` env var
  (baked into the image; only override this if you know what you are doing)

Some entries use both template variables; others pin the tag literally when
that workspace targets a specific Backstage release and is not expected to
track the platform's pinned version.

Real examples from `dynamic-plugins.default.yaml`:

```
oci://${PLUGIN_REGISTRY}/jenkins:bs_1.49.4!backstage-community-plugin-jenkins-backend
oci://${PLUGIN_REGISTRY}/jenkins:bs_1.49.4!backstage-community-plugin-jenkins
oci://${PLUGIN_REGISTRY}/sonarqube:bs_1.49.4!backstage-community-plugin-sonarqube
oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-frontend-dynamic
oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-backend
```

Notice that `marketplace` uses `${BACKSTAGE_VERSION}` because that workspace
tracks the platform pin exactly; the community plugin bundles (`jenkins`,
`sonarqube`, etc.) are pinned literally at `bs_1.49.4` and stay on that tag
until an explicit upgrade.

---

## Referencing the plugin from `devportal-platform`

Once your bundle is published, add an entry to `dynamic-plugins.default.yaml`.
The file is the authoritative inventory of every plugin the image can
optionally load. New entries always start `disabled: true`.

```yaml
# dynamic-plugins.default.yaml

- package: oci://${PLUGIN_REGISTRY}/<your-workspace>:bs_${BACKSTAGE_VERSION}!<your-selector>
  disabled: true
  pluginConfig:
    dynamicPlugins:
      frontend:        # or "backend:" for a backend plugin
        <your-plugin-id>:
          mountPoints:
            - mountPoint: entity.page.overview/cards
              importName: YourEntityCard
              config:
                layout:
                  gridColumn: "1 / -1"
```

The `pluginConfig` block is the full Scalprum configuration for this plugin:
`mountPoints`, `dynamicRoutes`, `menuItems`, `themes`, and so on. It stays
here — not in the preset — because it describes what the plugin *is*, not
which deployments enable it. See [dynamic-plugins](dynamic-plugins.md) for the
full lifecycle from OCI fetch to mount-point hydration.

Backend plugins typically need no `pluginConfig` block beyond the entry itself,
unless they require config keys injected via `app-config`.

---

## Enabling it via a preset

`dynamic-plugins.default.yaml` ships the plugin disabled. A preset turns it
on. Add to a preset's `plugins:` block:

```yaml
# presets/my-preset.yaml
plugins:
  - package: oci://${PLUGIN_REGISTRY}/<your-workspace>:bs_${BACKSTAGE_VERSION}!<your-selector>
    disabled: false
```

**Critical contract: the `package:` string must match the entry in
`dynamic-plugins.default.yaml` character for character**, including every
template variable (`${PLUGIN_REGISTRY}`, `${BACKSTAGE_VERSION}`). The
entrypoint substitutes both before the install runs and then merges preset
entries into the inventory by exact `package` key.

A mismatch means the installer sees two different keys. It installs the plugin
twice under different names. The backend starts, hits a duplicate plugin
registration, and crashes. The error message will not point you back to the
YAML key mismatch — you have to diff the strings manually.

From `presets/recommended.yaml`, a correct pair:

```yaml
# dynamic-plugins.default.yaml
- package: oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-backend
  disabled: true

# presets/recommended.yaml
- package: oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-backend
  disabled: false
```

Both strings are identical. That is the only safe state.

See [presets/SCHEMA.md](../../presets/SCHEMA.md) § "Composition" for how
`install-dynamic-plugins.py` performs the shallow merge, and what happens when
two presets reference the same package key.

---

## Registry mirroring

Operators who run their own internal registry (air-gap partial, corporate
proxy, pull-through cache) set one env var:

```
PLUGIN_REGISTRY=registry.internal/your-org
```

The entrypoint substitutes that value into every `oci://${PLUGIN_REGISTRY}/…`
ref before the install runs. You do not need to edit `dynamic-plugins.default.yaml`
or any preset — the substitution is applied globally to the full merged list.

Your internal registry must mirror the bundles under the same workspace paths
and tags as the upstream `quay.io/veecode` images. The simplest approach is a
pull-through proxy configured to mirror `quay.io/veecode/`.

See [dynamic-plugins](dynamic-plugins.md) § Distribution modes for the full
picture, including the distinction between mirror mode and loaded-variant mode.

---

## Loaded-variant alternative

For fully air-gapped environments where the container runtime cannot reach any
registry at boot, a **loaded variant** build is the correct approach.

You build your own image from the published base. The standard pattern is to
extract the plugin bundle at build time with `skopeo` + `tar` (the same tools
`install-dynamic-plugins.py` uses at runtime) and copy the result into the
image's plugin root:

```dockerfile
FROM veecode/devportal-platform:<tag>
USER root
RUN skopeo copy \
      docker://quay.io/veecode/<workspace>:bs_<ver> dir:/tmp/bundle && \
    LAYER=$(jq -r '.layers[0].digest | sub("sha256:";"")' /tmp/bundle/manifest.json) && \
    mkdir -p /app/dynamic-plugins-root && \
    tar -xzf /tmp/bundle/$LAYER -C /app/dynamic-plugins-root && \
    rm -rf /tmp/bundle
USER 1001
```

Then add the plugin to `dynamic-plugins.default.yaml` (or a preset fragment
mounted into the image) with `preInstalled: true`. At boot,
`install-dynamic-plugins.py` skips the OCI pull for preInstalled entries and
only merges their `pluginConfig:`. See the Dockerfile's own `skopeo`/`tar`
block (around lines 220–238) for the upstream-canonical version of this
recipe.

This approach trades build-time complexity for zero runtime registry access.
The tradeoff: every plugin update requires a new image build and push cycle,
rather than just updating the `PLUGIN_REGISTRY` env var or the `bs_<ver>` tag.

Veecode does not maintain a catalog of pre-baked loaded-variant images.
Customers who need this mode own the Dockerfile and the build pipeline.

This distribution mode was decided and documented in
[ADR-010 § "Distribution modes"](../adr/010-unified-image-and-presets.md).
