#!/usr/bin/env bash
set -euo pipefail

cd /app

mkdir -p /app/data /app/dynamic-plugins-root

# A Drydock run mounts the generated file at the canonical path. Local Gate 0/1
# runs use the empty image default unless an operator supplies the same mount.
if [[ -f /app/dynamic-plugins.yaml ]]; then
  DP_YAML_SOURCE=/app/dynamic-plugins.yaml
else
  DP_YAML_SOURCE=/app/dynamic-plugins.nfs.yaml
fi

# ── Resolve ${PLUGIN_REGISTRY} / ${BACKSTAGE_VERSION} in plugin OCI refs ──
# Parity with the OFS path (entrypoint.sh:343-402). The installer does NOT expand
# these itself — install-dynamic-plugins.py:610-614 says outright that the
# entrypoint is what hands it an already-resolved file.
#
# This was invisible for as long as dynamic-plugins.nfs.yaml was `plugins: []`.
# The first real entry reaches skopeo as the literal string `${PLUGIN_REGISTRY}`,
# and with the fail-fast at install-dynamic-plugins.py:753-764 that takes the
# whole boot down with exit 78 — a config-only change silently breaking the boot.
#
# Substitute into a COPY, never in place, same as entrypoint.sh's DP_YAML_SHADOW:
# the source is either a read-only bind mount (the tracer bench mounts
# /app/dynamic-plugins.yaml:ro; Drydock mounts a ConfigMap) or the baked image
# copy, and `sed -i` on either can fail. /tmp rather than /app so the shadow also
# works under readOnlyRootFilesystem, and rather than /app/dynamic-plugins-root
# because the installer owns that directory.
DP_YAML_SHADOW=/tmp/dynamic-plugins.resolved.yaml
cp -f "$DP_YAML_SOURCE" "$DP_YAML_SHADOW"

PLUGIN_REGISTRY="${PLUGIN_REGISTRY:-quay.io/veecode}"
sed -i "s|\${PLUGIN_REGISTRY}|${PLUGIN_REGISTRY}|g" "$DP_YAML_SHADOW"
echo "NFS resolving \${PLUGIN_REGISTRY} → ${PLUGIN_REGISTRY}"

# The NFS inventory pins OCI tags literally today (e.g. bs_1.53.0), so this is a
# no-op on the current file. It is here anyway because the day someone writes
# bs_${BACKSTAGE_VERSION} — the form dynamic-plugins.default.yaml already uses —
# the omission would surface as a skopeo error mid-install instead of a boot that
# just works.
BACKSTAGE_VERSION="${BACKSTAGE_VERSION:-$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /app/backstage.json 2>/dev/null | head -1)}"
if [[ -n "${BACKSTAGE_VERSION}" ]]; then
  sed -i "s|\${BACKSTAGE_VERSION}|${BACKSTAGE_VERSION}|g" "$DP_YAML_SHADOW"
  echo "NFS resolving \${BACKSTAGE_VERSION} → ${BACKSTAGE_VERSION}"
else
  echo "NFS WARN — could not read Backstage version from /app/backstage.json; \${BACKSTAGE_VERSION} left unresolved"
fi

export DYNAMIC_PLUGINS_FILE="$DP_YAML_SHADOW"

export NFS_KUBERNETES_FIXTURE="${NFS_KUBERNETES_FIXTURE:-/app/packages/app-next/fixtures/kubernetes-control.yaml}"

echo "NFS host: app-next"
echo "NFS dynamic plugins: ${DYNAMIC_PLUGINS_FILE} (from ${DP_YAML_SOURCE})"
echo "NFS standard module federation: ${ENABLE_STANDARD_MODULE_FEDERATION:-false}"

# Fail fast when an ENABLED `package:` ref still carries a ${...} placeholder,
# same contract as entrypoint.sh:386-402. Only `package:` is checked: pluginConfig
# legitimately carries ${VAR}s that Backstage resolves later.
#
# Python, not yq: this image has no yq. Dockerfile.nfs installs skopeo, jq, tar,
# gzip, ca-certificates and python3.12 + PyYAML — copying the OFS yq one-liner
# here would fail at runtime.
python3.12 - "$DP_YAML_SHADOW" <<'PY'
import sys

import yaml

path = sys.argv[1]
with open(path) as handle:
    document = yaml.safe_load(handle) or {}

unresolved = [
    str(plugin.get('package', ''))
    for plugin in (document.get('plugins') or [])
    if plugin.get('disabled') is not True and '${' in str(plugin.get('package', ''))
]

if unresolved:
    print(f'ERROR: unresolved ${{...}} placeholder(s) in enabled plugin refs in {path}:')
    for ref in unresolved[:3]:
        print(f'  {ref}')
    print('       Resolved by this entrypoint: ${PLUGIN_REGISTRY} and '
          '${BACKSTAGE_VERSION} (needs a readable /app/backstage.json).')
    sys.exit(78)
PY

python3.12 /app/install-dynamic-plugins.py /app/dynamic-plugins-root

CONFIG_ARGS=(
  --config /app/app-config.yaml
  --config /app/app-config.production.yaml
  --config /app/app-config.nfs.yaml
)

if [[ -f /app/app-config.local.yaml ]]; then
  CONFIG_ARGS+=(--config /app/app-config.local.yaml)
fi

if [[ -f /app/dynamic-plugins-root/app-config.dynamic-plugins.yaml ]]; then
  CONFIG_ARGS+=(--config /app/dynamic-plugins-root/app-config.dynamic-plugins.yaml)
fi

exec node /app/packages/backend "${CONFIG_ARGS[@]}"
