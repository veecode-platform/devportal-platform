#!/bin/bash

# ENTRYPOINT THEME HACKING

# old chart, will remove
if [ -n "$PLATFORM_DEVPORTAL_THEME_URL" ]; then
    echo "Getting custom theme file from $PLATFORM_DEVPORTAL_THEME_URL"
    curl -L -o /app/packages/app/dist/theme.json "$PLATFORM_DEVPORTAL_THEME_URL"
fi
# old chart, will remove
if [ -n "$PLATFORM_DEVPORTAL_FAVICON" ]; then
    echo "Getting favicon.ico from $PLATFORM_DEVPORTAL_FAVICON"
    curl -L -o /app/packages/app/dist/favicon.ico "$PLATFORM_DEVPORTAL_FAVICON"
fi

# new "next" chart
if [ -n "$THEME_DOWNLOAD_URL" ]; then
    echo "Getting custom theme file from $THEME_DOWNLOAD_URL"
    curl -L -o /app/packages/app/dist/theme.json "$THEME_DOWNLOAD_URL"
elif [ -n "$THEME_CUSTOM_JSON" ]; then
    if [ "false" = "$THEME_MERGE_JSON" ]; then
        echo "Using custom theme JSON from THEME_CUSTOM_JSON"
        echo "$THEME_CUSTOM_JSON" > /app/packages/app/dist/theme.json
    else
        echo "Merging custom theme JSON from THEME_CUSTOM_JSON"
        TARGET_JSON="/app/packages/app/dist/theme.json"
        TMP_JSON="$(mktemp)"
        MERGED_JSON="$(mktemp)"
        echo "$THEME_CUSTOM_JSON" > "$TMP_JSON"
        # Merge env-provided JSON with the existing JSON, output as JSON
        yq -p=json -o=json eval-all 'select(fileIndex == 0) * select(fileIndex == 1)' \
            "$TARGET_JSON" "$TMP_JSON" > "$MERGED_JSON"
        mv "$MERGED_JSON" "$TARGET_JSON"
        rm "$TMP_JSON"
    fi
fi
# new "next" chart
if [ -n "$THEME_FAV_ICON" ]; then
    echo "Getting favicon.ico from $THEME_FAV_ICON"
    curl -L -o /app/packages/app/dist/favicon.ico "$THEME_FAV_ICON"
fi

# Legacy distro var compat: devportal-platform uses VEECODE_PRESETS (compose),
# not VEECODE_PROFILE (one-of). If an operator migrated from devportal-distro and
# left the legacy var in their env, warn now so they don't later remove
# VEECODE_PRESETS thinking VEECODE_PROFILE is doing the work.
if [ -n "$VEECODE_PROFILE" ]; then
    echo "WARNING: VEECODE_PROFILE=$VEECODE_PROFILE is set but ignored on devportal-platform — use VEECODE_PRESETS instead. See docs/UPGRADING_FROM_BASE_DISTRO.md."
fi

# ENTRYPOINT FAIL-FAST: exclusive_group conflicts
# Runs before any download so a bad VEECODE_PRESETS value fails immediately.
if [ -n "$VEECODE_PRESETS" ]; then
    _SEEN_GROUPS=""
    for _preset in ${VEECODE_PRESETS//,/ }; do
        _pfile="/app/presets/$_preset.yaml"
        [ ! -f "$_pfile" ] && continue
        _group="$(yq eval '.exclusive_group // ""' "$_pfile" 2>/dev/null)"
        if [ -n "$_group" ]; then
            _existing="$(echo "$_SEEN_GROUPS" | grep "^${_group}=" | cut -d= -f2)"
            if [ -n "$_existing" ]; then
                echo "ERROR: presets \"$_existing\" and \"$_preset\" belong to the exclusive group \"$_group\" and cannot be selected together."
                echo "       Select only one identity preset: github-auth, azure-auth, gitlab, keycloak, ldap."
                exit 78
            fi
            _SEEN_GROUPS="${_SEEN_GROUPS}${_group}=${_preset}"$'\n'
        fi
    done
    unset _preset _pfile _group _existing _SEEN_GROUPS
fi

# ENTRYPOINT DOWNLOAD CATALOG INDEX
# Downloads the marketplace catalog entities (Plugin/Package/Collection YAMLs)
# from the OCI catalog index image published by export-overlays.
CATALOG_INDEX_IMAGE="${CATALOG_INDEX_IMAGE:-quay.io/veecode/plugin-catalog-index:latest}"
CATALOG_DIR="/app/catalog-entities/extensions"
PACKAGES_COUNT=$(find "$CATALOG_DIR/packages" -name '*.yaml' 2>/dev/null | wc -l)
if [ "$PACKAGES_COUNT" -eq 0 ] || [ "${CATALOG_INDEX_REFRESH:-false}" = "true" ]; then
    echo "Downloading catalog index from $CATALOG_INDEX_IMAGE"
    TMP_CATALOG="$(mktemp -d)"
    if skopeo copy "docker://$CATALOG_INDEX_IMAGE" "dir:$TMP_CATALOG"; then
        # Extract the single layer (tar) into the catalog directory
        LAYER=$(jq -r '.layers[0].digest' "$TMP_CATALOG/manifest.json" | sed 's/sha256://')
        tar -xf "$TMP_CATALOG/$LAYER" -C "$CATALOG_DIR" --strip-components=1 2>/dev/null || \
        tar -xzf "$TMP_CATALOG/$LAYER" -C "$CATALOG_DIR" --strip-components=1 2>/dev/null || \
        { echo "ERROR: Failed to extract catalog index layer"; }
        # Validate extraction
        YAML_COUNT=$(find "$CATALOG_DIR" -name '*.yaml' 2>/dev/null | wc -l)
        if [ "$YAML_COUNT" -lt 50 ]; then
            echo "WARNING: Catalog index has only $YAML_COUNT YAML files (expected ~215). Marketplace may be incomplete."
        else
            echo "Catalog index loaded: $YAML_COUNT YAML files"
        fi
    else
        echo "WARNING: Failed to download catalog index from $CATALOG_INDEX_IMAGE"
        echo "Marketplace will use any pre-existing catalog entities (baked-in or from previous run)."
    fi
    rm -rf "$TMP_CATALOG"
else
    echo "Catalog entities already present, skipping download (set CATALOG_INDEX_REFRESH=true to force)"
fi

# Resolve the persistent data directory and make sure it exists before anything
# writes into it. DEVPORTAL_DB_PATH (default /app/data) is the single directory
# for all persistent DevPortal state — the per-plugin sqlite databases and the
# extensions-install.yaml below. Mount a volume here so that state survives a
# restart. app-config.production.yaml points backend.database at the same
# ${DEVPORTAL_DB_PATH:-/app/data}.
DEVPORTAL_DB_PATH="${DEVPORTAL_DB_PATH:-/app/data}"
mkdir -p "$DEVPORTAL_DB_PATH"

# PREFLIGHT: DEVPORTAL_DB_PATH must be a writable directory that supports
# rename within it. The marketplace backend persists extensions-install.yaml
# via temp-file + atomic rename, which fails (EXDEV/EROFS) at runtime on a
# single-file bind mount or read-only volume — far from the cause. Refuse to
# boot instead, with the same fail-fast code used for preset validation.
if ! _PREFLIGHT_TMP="$(mktemp "$DEVPORTAL_DB_PATH/.preflight.XXXXXX" 2>/dev/null)" \
   || ! mv "$_PREFLIGHT_TMP" "${_PREFLIGHT_TMP}.renamed" 2>/dev/null; then
    echo "ERROR: $DEVPORTAL_DB_PATH is not a writable directory supporting rename."
    echo "       Mount a DIRECTORY volume at $DEVPORTAL_DB_PATH — not a single-file bind, not read-only."
    rm -f "$_PREFLIGHT_TMP" 2>/dev/null
    exit 78
fi
rm -f "${_PREFLIGHT_TMP}.renamed"
unset _PREFLIGHT_TMP

# Ensure extensions-install.yaml exists for the Python install script.
# DB is the source of truth; this file is a write-through cache the marketplace
# backend regenerates from the DB on every change (extensions.installation.
# saveToSingleFile.file in dynamic-plugins.default.yaml points at the same path).
# It MUST live under DEVPORTAL_DB_PATH — a directory volume — because the
# marketplace rewrites it via a temp-file + atomic rename, which fails on a
# single-file bind mount. On first boot it does not exist yet, so create one.
EXTENSIONS_INSTALL="$DEVPORTAL_DB_PATH/extensions-install.yaml"
# Quarantine a corrupted file instead of letting the installer crash-loop on
# it: install-dynamic-plugins.py reads includeContent['plugins'] and a file
# without that list fails the boot — and since the file lives on the volume,
# it fails EVERY boot until a human edits the volume. The DB is the source of
# truth and the marketplace regenerates this cache on every change, so
# resetting it loses nothing durable.
if [ -f "$EXTENSIONS_INSTALL" ] && [ "$(yq eval '.plugins | type' "$EXTENSIONS_INSTALL" 2>/dev/null)" != "!!seq" ]; then
    _BAK="$EXTENSIONS_INSTALL.bak.$(date +%s)"
    echo "WARNING: $EXTENSIONS_INSTALL is corrupted (no 'plugins:' list) — quarantining to $_BAK and starting empty. Marketplace selections will be re-synced from the database."
    mv "$EXTENSIONS_INSTALL" "$_BAK" 2>/dev/null || echo "WARNING: could not quarantine $EXTENSIONS_INSTALL; the installer may fail on it"
    unset _BAK
fi
if [ ! -f "$EXTENSIONS_INSTALL" ]; then
    echo 'plugins: []' > "$EXTENSIONS_INSTALL" 2>/dev/null || (echo 'plugins: []' > /tmp/extensions-install.yaml && cp /tmp/extensions-install.yaml "$EXTENSIONS_INSTALL")
fi

# ── Shadow /app/dynamic-plugins.yaml so we can mutate it ────────────
# The operator may bind-mount /app/dynamic-plugins.yaml (k8s ConfigMap, or
# `docker run -v host.yaml:/app/dynamic-plugins.yaml`). Single-file bind mounts
# are atomic-rename-hostile: `yq -i` / `sed -i` create a temp file in the same
# dir and rename it onto the target, which fails when the target is a bind-mount
# inode (you can't replace the mount). Result before this fix: the preset
# resolver's `yq -i ".includes = [...]" /app/dynamic-plugins.yaml` silently
# failed, so preset fragments existed on disk but were never wired into the
# includes chain — preset went inert AND operator's `plugins:` override
# evaporated with it. Same pattern as the `dynamic-plugins.default.resolved.yaml`
# shadow below.
#
# Fix: always copy /app/dynamic-plugins.yaml → /app/dynamic-plugins.resolved.yaml
# and have the entrypoint + install script operate on the shadow. The operator's
# `plugins:` list is preserved (cp copies it); the shadow is fully writable. The
# `includes:` chain is entrypoint-owned and rebuilt below on every boot.
DP_YAML=/app/dynamic-plugins.yaml
DP_YAML_SHADOW=/app/dynamic-plugins.resolved.yaml
if [ -f "$DP_YAML" ]; then
    if ! yq eval '.' "$DP_YAML" >/dev/null 2>&1; then
        echo "VEECODE: FATAL — /app/dynamic-plugins.yaml is not valid YAML; aborting boot" >&2
        exit 78
    fi
    cp -f "$DP_YAML" "$DP_YAML_SHADOW"
else
    echo 'plugins: []' > "$DP_YAML_SHADOW"
fi

# ── PRESET RESOLVER ──────────────────────────────────────────────────
# VEECODE_PRESETS is a comma-separated list of preset names. For each
# /app/presets/<name>.yaml the resolver:
#   1. fails the boot (exit 78) if any `requires.variables` entry with
#      `required: true` is unset/empty in the environment;
#   2. extracts the preset's `plugins:` into /app/preset-<name>-plugins.yaml
#      and appends it to the `includes:` of the dynamic-plugins shadow so
#      install-dynamic-plugins.sh picks the plugins up;
#   3. extracts the preset's `appConfig:` into /app/app-config.preset-<name>.yaml
#      and appends it to the backend --config list (Backstage deep-merges
#      --config files and resolves ${VAR} natively — no manual merge here).
# Empty/unset VEECODE_PRESETS → no preset; the image boots with only the
# core plugins declared in dynamic-plugins.yaml (ADR-010 validation #2).
PRESETS_DIR="/app/presets"
PRESET_CONFIG_ARGS=""
PRESET_INCLUDES=""
if [ -n "$VEECODE_PRESETS" ]; then
    echo "VEECODE: preset resolver — VEECODE_PRESETS=$VEECODE_PRESETS"
    MISSING_VARS=""
    _APPLIED_PRESETS=""

    for preset in ${VEECODE_PRESETS//,/ }; do
        PRESET_FILE="$PRESETS_DIR/$preset.yaml"
        if [ ! -f "$PRESET_FILE" ]; then
            echo "ERROR: preset \"$preset\" not found at $PRESET_FILE"
            echo "       available presets: $(ls "$PRESETS_DIR" 2>/dev/null | grep '\.yaml$' | sed 's/\.yaml$//' | tr '\n' ' ')"
            exit 78
        fi
        if ! yq eval '.' "$PRESET_FILE" >/dev/null 2>&1; then
            echo "ERROR: preset \"$preset\" ($PRESET_FILE) is not valid YAML"
            exit 78
        fi
        echo "VEECODE: applying preset \"$preset\""

        # 0. composition dependencies (requires.presets): each listed preset
        #    must be selected BEFORE this one — list order drives appConfig
        #    override order (later --config files win), so presence alone is
        #    not enough. Replaces the comment-only convention (mcp-chat→mcp,
        #    ldap-ad→ldap) that booted clean and failed in the user's face.
        for dep in $(yq eval '(.requires.presets // []) | .[]' "$PRESET_FILE"); do
            if ! echo "$_APPLIED_PRESETS" | grep -qx "$dep"; then
                echo "ERROR: preset \"$preset\" requires preset \"$dep\" to be selected before it."
                echo "       Example: VEECODE_PRESETS=${dep},${preset}"
                exit 78
            fi
        done

        # 1. required variables
        for var in $(yq eval '(.requires.variables // {}) | to_entries | map(select(.value.required == true)) | .[].key' "$PRESET_FILE"); do
            if [ -z "${!var}" ]; then
                desc="$(yq eval ".requires.variables.${var}.description // \"\"" "$PRESET_FILE")"
                docs="$(yq eval ".requires.variables.${var}.docs // \"\"" "$PRESET_FILE")"
                msg="Preset \"$preset\" requires ${var}."
                [ -n "$desc" ] && msg="$msg $desc"
                [ -n "$docs" ] && msg="$msg See $docs"
                MISSING_VARS="${MISSING_VARS}"$'\n'"  - ${msg}"
            fi
        done

        # 2. plugins → include fragment (must carry a non-null `plugins:` list —
        #    install-dynamic-plugins.py reads includeContent['plugins'] directly)
        if [ "$(yq eval '(.plugins // []) | length' "$PRESET_FILE")" -gt 0 ]; then
            yq eval '{"plugins": .plugins}' "$PRESET_FILE" > "/app/preset-${preset}-plugins.yaml"
            PRESET_INCLUDES="$PRESET_INCLUDES preset-${preset}-plugins.yaml"
        fi

        # 3. appConfig → --config file
        if [ "$(yq eval '(.appConfig // {}) | length' "$PRESET_FILE")" -gt 0 ]; then
            yq eval '.appConfig' "$PRESET_FILE" > "/app/app-config.preset-${preset}.yaml"
            PRESET_CONFIG_ARGS="$PRESET_CONFIG_ARGS --config /app/app-config.preset-${preset}.yaml"
        fi

        _APPLIED_PRESETS="${_APPLIED_PRESETS}${preset}"$'\n'
    done
    unset _APPLIED_PRESETS

    if [ -n "$MISSING_VARS" ]; then
        echo "ERROR: the selected preset(s) require variables that are not set:"
        echo "$MISSING_VARS"
        echo "Set them via the environment or \$VEECODE_APP_CONFIG and restart."
        exit 78
    fi

else
    echo "VEECODE: no presets selected (VEECODE_PRESETS unset) — core only (catalog + global header). Add 'recommended' to VEECODE_PRESETS to enable marketplace, RBAC, tech-radar."
fi

# Operators migrating from RHDH habitually add their own `includes:` to
# dynamic-plugins.yaml; those are replaced below by the entrypoint-owned chain.
# Losing them silently reads as "my plugins vanished" — warn explicitly.
if [ -f "$DP_YAML" ] && [ "$(yq eval '.includes // [] | length' "$DP_YAML" 2>/dev/null)" -gt 0 ]; then
    echo "VEECODE: WARNING — 'includes:' in $DP_YAML is ignored; the includes chain is entrypoint-owned (marketplace state + preset fragments). Declare extra plugins under 'plugins:' instead."
fi

# Rebuild the includes list on the shadow on every boot: marketplace state first,
# then preset fragments. dynamic-plugins.default.yaml is NOT included — it is
# documentation only (vitrine). Core plugins live in dynamic-plugins.yaml plugins:.
# The shadow is always writable (we own it), so this is safe even when
# /app/dynamic-plugins.yaml is bind-mounted read-only. The operator's top-level
# `plugins:` list from /app/dynamic-plugins.yaml is preserved by the earlier cp,
# but operator-provided `includes:` are intentionally replaced so both preset and
# no-preset boots use the same composition path.
INCLUDES_JSON="$(printf '"%s",' "$DEVPORTAL_DB_PATH/extensions-install.yaml" $PRESET_INCLUDES | sed 's/,$//')"
yq eval -i ".includes = [${INCLUDES_JSON}]" "$DP_YAML_SHADOW" || {
    echo "VEECODE: FATAL — failed to write the includes chain to $DP_YAML_SHADOW; aborting boot" >&2
    exit 78
}
echo "VEECODE: dynamic plugin includes → $(yq eval -o=json -I=0 '.includes' "$DP_YAML_SHADOW")"
# ── END PRESET RESOLVER ──────────────────────────────────────────────

# SAAS: expand VEECODE_APP_CONFIG into a separate config file.
# Written to a NEW file (not the ConfigMap-mounted app-config.local.yaml)
# so it coexists with the chart's base config. Backstage merges --config
# files in order; app-config.saas.yaml loads last and wins for overlapping keys.
# Dynamic plugins are injected via Helm values (global.dynamic) into the
# ConfigMap, so no entrypoint override is needed for dynamic-plugins.yaml.
if [ ! -z "$VEECODE_APP_CONFIG" ]; then
    echo "VEECODE_APP_CONFIG detected, decoding into /app/app-config.saas.yaml"
    # Validate at the edge: a bad value written verbatim only surfaces ~45s
    # later as a node config-loader error naming the FILE, never this var.
    if ! echo "$VEECODE_APP_CONFIG" | base64 -d > /app/app-config.saas.yaml 2>/dev/null; then
        echo "ERROR: VEECODE_APP_CONFIG is not valid base64 — refusing to boot with a corrupted app-config."
        exit 78
    fi
    # Backstage requires an object at the config root (multi-doc YAML is not
    # an app-config shape, so the single-doc `type` check is intentional).
    if [ "$(yq eval 'type' /app/app-config.saas.yaml 2>/dev/null | head -1)" != "!!map" ]; then
        echo "ERROR: VEECODE_APP_CONFIG decoded, but the content is not a YAML object."
        echo "       Check the value you base64-encoded — it must be an app-config YAML document."
        exit 78
    fi
    echo "VEECODE_APP_CONFIG expanded successfully"
else
    echo "VEECODE_APP_CONFIG variable not found (this is expected in non-SaaS deployments)"
fi

# dynamic-plugins.default.yaml is NOT shadowed or included at runtime.
# It is documentation only (vitrine). Core plugins live in dynamic-plugins.yaml.

# ── Resolve ${BACKSTAGE_VERSION} in plugin OCI refs ─────────────────
# Plugin OCI artifacts are tagged by Backstage version — `bs_<bsver>__latest`
# (the moving tag, re-fetched on restart via pullPolicy: Always) for
# devportal-plugin-export-overlays artifacts, `bs_<bsver>` for the
# quay.io/veecode/{backstage,mcp-*,extensions} images. The shipped config writes
# `bs_${BACKSTAGE_VERSION}…` so a Backstage bump doesn't mean editing every preset;
# substitute the literal here (after the preset fragments are generated, before the
# install script runs). BACKSTAGE_VERSION defaults to the version in backstage.json.
# (read the version with sed, not `yq eval '.version'` — for a .json input mikefarah yq
#  keeps the JSON quoting on output, i.e. emits "1.49.4" with the quote chars)
BACKSTAGE_VERSION="${BACKSTAGE_VERSION:-$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /app/backstage.json 2>/dev/null | head -1)}"
if [ -n "$BACKSTAGE_VERSION" ]; then
    echo "VEECODE: resolving \${BACKSTAGE_VERSION} → $BACKSTAGE_VERSION in plugin OCI refs"
    for f in "$DP_YAML_SHADOW" "$DEVPORTAL_DB_PATH/extensions-install.yaml" /app/preset-*-plugins.yaml; do
        [ -f "$f" ] || continue
        sed -i "s/\${BACKSTAGE_VERSION}/$BACKSTAGE_VERSION/g" "$f" 2>/dev/null \
          || echo "VEECODE: note — $f is read-only; \${BACKSTAGE_VERSION} left as-is there (harmless if those refs are disabled)"
    done
else
    echo "VEECODE: WARN — could not read Backstage version from /app/backstage.json; \${BACKSTAGE_VERSION} left unresolved"
fi

# ── Resolve ${PLUGIN_REGISTRY} in plugin OCI refs ───────────────────
# Allows operators to mirror plugin images to an internal registry
# (on-premise / air-gapped) without editing YAML — just set
# PLUGIN_REGISTRY=registry.internal/veecode. Defaults to quay.io/veecode.
PLUGIN_REGISTRY="${PLUGIN_REGISTRY:-quay.io/veecode}"
echo "VEECODE: resolving \${PLUGIN_REGISTRY} → $PLUGIN_REGISTRY in plugin OCI refs"
for f in "$DP_YAML_SHADOW" "$DEVPORTAL_DB_PATH/extensions-install.yaml" /app/preset-*-plugins.yaml; do
    [ -f "$f" ] || continue
    sed -i "s|\${PLUGIN_REGISTRY}|$PLUGIN_REGISTRY|g" "$f" 2>/dev/null \
      || echo "VEECODE: note — $f is read-only; \${PLUGIN_REGISTRY} left as-is there (harmless if those refs are disabled)"
done

# Log one fully-resolved OCI ref so an operator can verify the substitutions
# (PLUGIN_REGISTRY + BACKSTAGE_VERSION) actually landed in the files the install
# script will read. Useful for air-gapped / mirror deployments where a typo in
# PLUGIN_REGISTRY would otherwise only surface as a skopeo error mid-install.
_SAMPLE_REF="$(yq eval '.plugins[] | select(.package // "" | test("^oci://")) | .package' "$DP_YAML_SHADOW" 2>/dev/null | head -1)"
[ -z "$_SAMPLE_REF" ] && _SAMPLE_REF="$(yq eval '.plugins[] | select(.package // "" | test("^oci://")) | .package' /app/preset-*-plugins.yaml 2>/dev/null | head -1)"
[ -n "$_SAMPLE_REF" ] && echo "VEECODE: example resolved plugin ref → $_SAMPLE_REF"
unset _SAMPLE_REF

# Fail fast if an ENABLED plugin ref still carries an unresolved ${...}
# placeholder — backstage.json was unreadable, or the ref uses a variable this
# entrypoint does not substitute. Without this the same mistake surfaces as a
# per-plugin skopeo error mid-install. Only `package:` refs are checked:
# pluginConfig legitimately carries ${VAR}s that Backstage resolves at runtime.
_UNRESOLVED=""
for f in "$DP_YAML_SHADOW" "$DEVPORTAL_DB_PATH/extensions-install.yaml" /app/preset-*-plugins.yaml; do
    [ -f "$f" ] || continue
    _BAD="$(yq eval '.plugins[]? | select(.disabled != true) | .package // ""' "$f" 2>/dev/null | grep -F '${' | head -3)"
    [ -n "$_BAD" ] && _UNRESOLVED="${_UNRESOLVED}"$'\n'"  $f: $_BAD"
done
if [ -n "$_UNRESOLVED" ]; then
    echo "ERROR: unresolved \${...} placeholder(s) in enabled plugin refs:"
    echo "$_UNRESOLVED"
    echo "       Placeholders resolved by this entrypoint: \${BACKSTAGE_VERSION} (needs a readable /app/backstage.json) and \${PLUGIN_REGISTRY}."
    exit 78
fi
unset _UNRESOLVED _BAD

# ENTRYPOINT INSTALL PLUGINS
# Point the install script at the resolved shadow — it has the preset fragments
# wired into `includes:` and ${PLUGIN_REGISTRY}/${BACKSTAGE_VERSION} substituted.
# The canonical /app/dynamic-plugins.yaml may be a read-only bind mount and
# would be missing those mutations.
export DYNAMIC_PLUGINS_FILE="$DP_YAML_SHADOW"
# Clear a stale install lock. install-dynamic-plugins.py keeps its lock file
# inside /app/dynamic-plugins-root/; when that directory is on a persistent
# volume, a SIGKILL/OOM (which skips the atexit cleanup) leaves the lock behind
# and the next boot would spin-wait on it forever. At boot nothing else holds
# the lock, so removing it here is safe.
rm -f /app/dynamic-plugins-root/install-dynamic-plugins.lock

# Fail the boot if plugin installation fails. install-dynamic-plugins.py exits
# non-zero on any fatal config error — duplicate plugin refs, malformed YAML,
# integrity failures. Booting with a half-installed plugin set is itself a
# footgun, so abort here (exit 78, same fail-fast code used for preset vars).
/app/install-dynamic-plugins.sh /app/dynamic-plugins-root || {
    echo "VEECODE: FATAL — dynamic plugin installation failed; aborting boot" >&2
    exit 78
}

# Remove RHDH extensions backend AFTER install — it ships in the base image
# and gets re-installed by install-dynamic-plugins.sh from defaults.
# Our devportal-marketplace-backend replaces it (same pluginId "extensions").
# Logged because an operator who enables this plugin deliberately would
# otherwise watch it install and vanish with no trace.
if [ -d /app/dynamic-plugins-root/red-hat-developer-hub-backstage-plugin-extensions-backend ]; then
    echo "VEECODE: removing red-hat-developer-hub-backstage-plugin-extensions-backend — replaced by devportal-marketplace-backend (both register pluginId \"extensions\" and would conflict on /api/extensions/*)"
    rm -rf /app/dynamic-plugins-root/red-hat-developer-hub-backstage-plugin-extensions-backend 2>/dev/null
fi
if [ ! -z "$VEECODE_DOMAIN" ]; then
    echo "VEECODE_DOMAIN detected (this is expected in VeeCode SaaS deployments): $VEECODE_DOMAIN"
else
    echo "VEECODE_DOMAIN variable not found (this is expected in non-SaaS deployments)"
fi

DYNAMIC_PLUGINS_CONFIG="/app/dynamic-plugins-root/app-config.dynamic-plugins.yaml"
DISTRO_CONFIG="/app/app-config.distro.yaml"
LOCAL_CONFIG="/app/app-config.local.yaml"
SAAS_CONFIG="/app/app-config.saas.yaml"
EXTRA_ARGS=""

#
# Config file precedence (all merge, override in order — later wins):
#
# app-config.yaml                       — base distribution defaults
# app-config.production.yaml            — container/production overrides
# app-config.distro.yaml                — VeeCode distro defaults (~10 lines, escape hatch)
# app-config.preset-{name}.yaml         — selected via VEECODE_PRESETS (user choice; overrides distro defaults)
# app-config.local.yaml                 — operator-level overrides (from VEECODE_APP_CONFIG or volume mount)
# dynamic-plugins-root/app-config.dynamic-plugins.yaml — generated by install-dynamic-plugins.py at boot
# app-config.saas.yaml                  — SaaS-time overrides (database URL, etc.)
#

# Distro overrides — defaults baked into this distribution (carries no user intent)
if [ -f "$DISTRO_CONFIG" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --config $DISTRO_CONFIG"
fi

# Preset app-config files (selected via VEECODE_PRESETS; resolved earlier).
# Loaded AFTER distro so an explicit preset choice wins over the distro defaults.
EXTRA_ARGS="$EXTRA_ARGS$PRESET_CONFIG_ARGS"
# Local overrides
if [ -f "$LOCAL_CONFIG" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --config $LOCAL_CONFIG"
fi
if [ -f "$DYNAMIC_PLUGINS_CONFIG" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --config $DYNAMIC_PLUGINS_CONFIG"
fi
# SaaS config loads LAST — overrides chart defaults for database, URLs, etc.
# while preserving branding, CSP, catalog rules from the ConfigMap
if [ -f "$SAAS_CONFIG" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --config $SAAS_CONFIG"
fi

if [ -z "$DEBUG_PORT" ]; then
    DEBUG_ARGS=""
else
    DEBUG_ARGS="--inspect=0.0.0.0:$DEBUG_PORT"
fi

# EXECUTE THE COMMAND
if [ "$DEVELOPMENT" = "true" ]; then
    echo "Running in DEVELOPMENT mode with auto-restart on config changes and debug port"
    echo "EXTRA_ARGS=$EXTRA_ARGS"
    exec npx nodemon \
        --watch app-config.yaml \
        --watch app-config.production.yaml \
        --watch "$LOCAL_CONFIG" \
        --watch "$DYNAMIC_PLUGINS_CONFIG" \
        --exec "node $NODE_OPTIONS $DEBUG_ARGS packages/backend --config app-config.yaml --config app-config.production.yaml $EXTRA_ARGS"
else
    echo "Running in PRODUCTION mode"
    echo "EXTRA_ARGS=$EXTRA_ARGS"
    exec node $NODE_OPTIONS $DEBUG_ARGS packages/backend \
        --config app-config.yaml \
        --config app-config.production.yaml $EXTRA_ARGS
fi
