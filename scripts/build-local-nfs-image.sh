#!/usr/bin/env bash
set -euo pipefail

# Builds the isolated NFS host image. This script never writes :latest, pushes
# to a registry, or touches the OFS Dockerfile/build script.

IMAGE_NAME="veecode/devportal-nfs"
DOCKERFILE_PATH="Dockerfile.nfs"
NO_CACHE=""
MEMORY_LIMIT="3g"
MEMORY_SWAP="4g"
SKIP_BUILD=false

print_status() { printf '[INFO] %s\n' "$1"; }
print_success() { printf '[SUCCESS] %s\n' "$1"; }
print_warning() { printf '[WARN] %s\n' "$1"; }
print_error() { printf '[ERROR] %s\n' "$1" >&2; }

show_help() {
  cat <<'EOF'
Builds the isolated local/CI NFS host image.

Usage: ./scripts/build-local-nfs-image.sh [OPTIONS]

Options:
  --no-cache       Disable Docker layer caching
  --skip-build     Use existing backend/app-next artefacts
  --memory=<size>  Docker build memory (default: 3g)
  --help, -h       Show this help

The output tag is versioned with a -nfs-local suffix. No :latest tag is
created and no registry operation is performed.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-cache) NO_CACHE="--no-cache"; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --memory=*) MEMORY_LIMIT="${1#*=}"; shift ;;
    --help|-h) show_help; exit 0 ;;
    *) print_error "Unknown option: $1"; show_help; exit 1 ;;
  esac
done

[[ -f package.json ]] || { print_error 'package.json not found; run from repository root'; exit 1; }
command -v docker >/dev/null || { print_error 'Docker is not installed or not in PATH'; exit 1; }

VERSION="$(node -p "require('./package.json').version")"
IMAGE_TAG="${VERSION}-nfs-local"
IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"

if [[ "$SKIP_BUILD" == false ]]; then
  print_status 'Building app-next and backend artefacts on the host'
  yarn install --immutable
  NODE_OPTIONS="--max-old-space-size=6144" yarn workspace app-next tsc
  NODE_OPTIONS="--max-old-space-size=6144" yarn workspace app-next build
  NODE_OPTIONS="--max-old-space-size=6144" yarn build:backend
else
  print_warning '--skip-build: using existing artefacts'
fi

[[ -f packages/backend/dist/skeleton.tar.gz ]] || { print_error 'missing skeleton.tar.gz'; exit 1; }
[[ -f packages/backend/dist/bundle.tar.gz ]] || { print_error 'missing bundle.tar.gz'; exit 1; }
[[ -f packages/app-next/dist/index.html ]] || { print_error 'missing app-next/dist/index.html'; exit 1; }

if ! tar -tzf packages/backend/dist/skeleton.tar.gz | grep -F 'packages/app-next/package.json' >/dev/null; then
  print_error 'skeleton does not contain packages/app-next/package.json'; exit 1
fi
if ! tar -tzf packages/backend/dist/bundle.tar.gz | grep -F 'packages/app-next/dist/index.html' >/dev/null; then
  print_error 'bundle does not contain packages/app-next/dist/index.html'; exit 1
fi

print_status "Building ${IMAGE_REF} from ${DOCKERFILE_PATH}"
DOCKER_ARGS=(
  build
  -f "$DOCKERFILE_PATH"
  --tag "$IMAGE_REF"
  --memory="$MEMORY_LIMIT"
  --memory-swap="$MEMORY_SWAP"
  --progress plain
  --build-arg "DEVPORTAL_VERSION=${VERSION}"
)
[[ -n "$NO_CACHE" ]] && DOCKER_ARGS+=("$NO_CACHE")
DOCKER_ARGS+=(.)

docker "${DOCKER_ARGS[@]}"
docker image inspect "$IMAGE_REF" --format 'image={{.RepoTags}} id={{.Id}}'
print_success "Built ${IMAGE_REF}; no registry or mutable tag was changed"
