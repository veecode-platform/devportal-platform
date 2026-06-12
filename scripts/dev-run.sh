#!/bin/bash
# Fast inner-loop for config / script / dynamic-plugin changes — NO image rebuild.
#
# Bind-mounts the host's runtime config & scripts over the baked-in copies, so changes to
# entrypoint.sh, presets/, dynamic-plugins.default.yaml, app-config.*.yaml, or
# docker/install-dynamic-plugins.py take effect on a `docker restart` (~30s) instead of a
# full ~25-35 min `docker build`.
#
# Dynamic plugins: `dp-extract` copies the baked /app/dynamic-plugins-root/ out of the
# image into .devrun-cache/dynamic-plugins-root/ (the complete working set — the npm
# downloads, the marketplace catalog module already /alpha-patched, every wrapper). Edit
# that directory directly (drop in a plugin dir, swap a wrapper's dist-scalprum/, etc. — or
# point `cd dynamic-plugins && yarn build && yarn export-dynamic && yarn copy-dynamic-plugins`
# at it), then `run` mounts it over /app/dynamic-plugins-root/. So iterating on a plugin no
# longer needs a `docker build` either.
#
# NOT covered (these still need a build): packages/app/* and packages/backend/* code (use
# `yarn dev-local` for those), the Dockerfile itself, or a dependency change.
# (`dynamic-plugins.yaml` is bind-mountable as of the shadow-file fix in entrypoint.sh:
# the entrypoint copies it to /app/dynamic-plugins.resolved.yaml and mutates the shadow,
# so a read-only mount no longer makes the preset resolver inert.)
#
# Runs on :7007 to match the image's baked app.baseUrl/backend.baseUrl (avoids the CORS
# trap you hit when running on a different port). Memory-capped per the WSL constraints.
#
# Usage:
#   ./scripts/dev-run.sh [run]    # (re)create the container, wait for healthcheck
#   ./scripts/dev-run.sh reload   # docker restart + wait for healthcheck (after editing a mounted file)
#   ./scripts/dev-run.sh dp-extract   # copy the image's dynamic-plugins-root into .devrun-cache/ for local editing
#   ./scripts/dev-run.sh logs     # follow logs (raw, bypassing any log proxy)
#   ./scripts/dev-run.sh stop     # stop & remove the container
#
#   VEECODE_PRESETS=recommended,github ./scripts/dev-run.sh run
#   DEVPORTAL_IMAGE=veecode/devportal-platform:1.3.5 ./scripts/dev-run.sh run
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${DEVPORTAL_IMAGE:-veecode/devportal-platform:latest}"
NAME="${DEVPORTAL_CONTAINER:-devportal-dev}"
PORT="${PORT:-7007}"
MEM="${DEVPORTAL_MEM:-2g}"
MEMSWAP="${DEVPORTAL_MEMSWAP:-3g}"
CMD="${1:-run}"

CACHE_DIR="$REPO/.devrun-cache"
DP_ROOT_LOCAL="$CACHE_DIR/dynamic-plugins-root"   # if this dir exists, `run` mounts it over /app/dynamic-plugins-root

# NOTE: catalog-backend-module-extensions used to need a per-module patch here because
# it imports catalogProcessingExtensionPoint from @backstage/plugin-catalog-node/alpha,
# which catalog-node 2.2.0 moved to the main entry. That is now fixed centrally by the
# /alpha compat shim baked into the image (Dockerfile), so this script no longer patches
# the module — it runs the image as-is.

mounts=(
  -v "$REPO/entrypoint.sh:/app/entrypoint.sh:ro"
  -v "$REPO/presets:/app/presets:ro"
  -v "$REPO/dynamic-plugins.default.yaml:/app/dynamic-plugins.default.yaml:ro"
  -v "$REPO/app-config.yaml:/app/app-config.yaml:ro"
  -v "$REPO/app-config.production.yaml:/app/app-config.production.yaml:ro"
  -v "$REPO/app-config.distro.yaml:/app/app-config.distro.yaml:ro"
  -v "$REPO/docker/install-dynamic-plugins.py:/app/install-dynamic-plugins.py:ro"
)

wait_healthy() {
  printf 'waiting for backend '
  for i in $(seq 1 60); do
    if curl -sf -m2 "http://localhost:$PORT/healthcheck" >/dev/null 2>&1; then
      printf ' up (~%ds)\n' "$((i*3))"; return 0
    fi
    printf '.'; sleep 3
  done
  printf ' TIMEOUT — check: docker logs %s\n' "$NAME"; return 1
}

case "$CMD" in
  dp-extract)
    mkdir -p "$CACHE_DIR"
    [ -d "$DP_ROOT_LOCAL" ] && echo "note: $DP_ROOT_LOCAL exists — replacing it (any local edits will be lost)"
    rm -rf "$DP_ROOT_LOCAL"
    cid="$(docker create "$IMAGE")"
    docker cp "$cid:/app/dynamic-plugins-root" "$DP_ROOT_LOCAL"
    docker rm "$cid" >/dev/null 2>&1 || true
    # docker cp preserves the in-container uid; the container's `default` user (a
    # different uid) must be able to write here — the install script creates a lock
    # file and (re)generates app-config.dynamic-plugins.yaml in this directory.
    chmod -R a+rwX "$DP_ROOT_LOCAL"
    echo "extracted $IMAGE's dynamic-plugins-root → $DP_ROOT_LOCAL  ($(ls "$DP_ROOT_LOCAL" | grep -c . ) entries, chmod a+rwX)"
    echo "edit it (add/swap a plugin dir, or patch JS files in place — there is no host-side dynamic-plugins build anymore),"
    echo "then: $0 run    (it will mount this dir over /app/dynamic-plugins-root/ — no build)"
    ;;
  run)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    if [ -d "$DP_ROOT_LOCAL" ]; then
      mounts+=( -v "$DP_ROOT_LOCAL:/app/dynamic-plugins-root" )
      echo "dynamic plugins: mounting local overlay $DP_ROOT_LOCAL"
    fi
    # Operator override: bind-mount a host dynamic-plugins.yaml over the canonical
    # path. Smoke uses this to regression-test the V0.X composition fix; operators
    # use it in real deploys (k8s ConfigMap, host file, etc.). The entrypoint copies
    # this to a writable shadow before mutating it, so :ro is safe.
    if [ -n "${DEVPORTAL_DP_OVERRIDE:-}" ]; then
      [ -f "$DEVPORTAL_DP_OVERRIDE" ] || { echo "DEVPORTAL_DP_OVERRIDE='$DEVPORTAL_DP_OVERRIDE' not found" >&2; exit 1; }
      mounts+=( -v "$DEVPORTAL_DP_OVERRIDE:/app/dynamic-plugins.yaml:ro" )
      echo "operator override: mounting $DEVPORTAL_DP_OVERRIDE → /app/dynamic-plugins.yaml:ro"
    fi
    # Forward VEECODE_PRESETS plus any preset env vars present in the calling
    # shell (GITHUB_PAT, AZURE_DEVOPS_*, KEYCLOAK_*, …) and VEECODE_APP_CONFIG,
    # so `GITHUB_PAT=… VEECODE_PRESETS=recommended,github $0 run` works.
    env_args=( -e VEECODE_PRESETS="${VEECODE_PRESETS:-}" )
    fwd=""
    for v in $(compgen -e 2>/dev/null | grep -E '^(VEECODE_APP_CONFIG$|BACKSTAGE_VERSION$|AUTH_|GITHUB_|GITLAB_|AZURE_|KEYCLOAK_|LDAP_|KONG_|SONAR|JENKINS_|K8S_|MCP_CHAT_|PLUGIN_REGISTRY$)' || true); do
      env_args+=( -e "$v" ); fwd="$fwd $v"
    done
    echo "starting $NAME  image=$IMAGE  port=$PORT  mem=$MEM  VEECODE_PRESETS=${VEECODE_PRESETS:-<none>}${fwd:+  +env:$fwd}"
    docker run -d --name "$NAME" -p "$PORT:7007" --memory="$MEM" --memory-swap="$MEMSWAP" \
      "${env_args[@]}" "${mounts[@]}" "$IMAGE" >/dev/null
    wait_healthy
    echo "→ http://localhost:$PORT    (edit a mounted config/script, then: $0 reload)"
    ;;
  reload|restart)
    docker restart "$NAME" >/dev/null
    wait_healthy
    echo "→ http://localhost:$PORT  (reloaded)"
    ;;
  logs)
    if command -v rtk >/dev/null 2>&1; then rtk proxy docker logs -f "$NAME"; else docker logs -f "$NAME"; fi
    ;;
  stop)
    docker rm -f "$NAME" >/dev/null 2>&1 && echo "$NAME stopped & removed" || echo "($NAME not running)"
    ;;
  *)
    echo "usage: $0 [run|reload|dp-extract|logs|stop]" >&2; exit 1
    ;;
esac
