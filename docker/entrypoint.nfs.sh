#!/usr/bin/env bash
set -euo pipefail

cd /app

mkdir -p /app/data /app/dynamic-plugins-root

# A Drydock run mounts the generated file at the canonical path. Local Gate 0/1
# runs use the empty image default unless an operator supplies the same mount.
if [[ -f /app/dynamic-plugins.yaml ]]; then
  export DYNAMIC_PLUGINS_FILE=/app/dynamic-plugins.yaml
else
  export DYNAMIC_PLUGINS_FILE=/app/dynamic-plugins.nfs.yaml
fi

export NFS_KUBERNETES_FIXTURE="${NFS_KUBERNETES_FIXTURE:-/app/packages/app-next/fixtures/kubernetes-control.yaml}"

echo "NFS host: app-next"
echo "NFS dynamic plugins: ${DYNAMIC_PLUGINS_FILE}"
echo "NFS standard module federation: ${ENABLE_STANDARD_MODULE_FEDERATION:-false}"

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
