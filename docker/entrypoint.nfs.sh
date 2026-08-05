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

CONFIG_ARGS=(
  --config /app/app-config.yaml
  --config /app/app-config.production.yaml
  --config /app/app-config.nfs.yaml
)

if [[ -f /app/app-config.local.yaml ]]; then
  CONFIG_ARGS+=(--config /app/app-config.local.yaml)
fi

# ── STATELESS PRE-STEP (ADR-014 + D-G5 amendment) ────────────────────────────
# When backend.database.client is pg, the operator's marketplace selections live
# in Postgres, not on /app/data. Rebuild extensions-install.yaml from the database
# BEFORE the Python installer reads it — the installer runs before the Node
# backend, so it cannot read the database itself. No-op for SQLite (the script
# gates on client: pg).
#
# FAIL-CLOSED on this path, unlike OFS. entrypoint.sh runs the same script with a
# trailing `|| echo WARNING` and the script itself always exits 0, so an
# unreachable Postgres there boots a host with an empty plugin set. On NFS that is
# refused: EXTENSIONS_PRESTEP_FAIL_CLOSED makes the script exit 78 when Postgres is
# configured but unusable, and `set -e` turns that into a refused boot.
#
# Still soft, by design: SQLite deployments, and a fresh tenant whose
# marketplace_installations table does not exist yet.
#
# Runs with the SAME --config files the backend gets, so the resolver sees the
# same database configuration the backend will.
if [[ -f /app/regenerate-extensions-install.js ]]; then
  EXTENSIONS_PRESTEP_FAIL_CLOSED=true \
    node /app/regenerate-extensions-install.js "${CONFIG_ARGS[@]}"
else
  echo "NFS pre-step: /app/regenerate-extensions-install.js absent — skipping" >&2
fi

python3.12 /app/install-dynamic-plugins.py /app/dynamic-plugins-root

if [[ -f /app/dynamic-plugins-root/app-config.dynamic-plugins.yaml ]]; then
  CONFIG_ARGS+=(--config /app/dynamic-plugins-root/app-config.dynamic-plugins.yaml)
fi

exec node /app/packages/backend "${CONFIG_ARGS[@]}"
