#!/bin/bash
set -e

# DevPortal Local Image Build Script
#
# Orchestrates two steps:
#   1. yarn build:backend  — compiles on the host (Node, full RAM, turbo cache)
#   2. docker build        — packages the pre-built artefacts into the image
#
# Usage:
#   ./scripts/build-local-image.sh [OPTIONS]
#
# Options:
#   --no-cache       Disable Docker layer caching
#   --memory=<size>  Override memory limit (default: 3g)
#   --help, -h       Show help message

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

IMAGE_NAME="veecode/devportal"
DOCKERFILE_PATH="Dockerfile"
NO_CACHE=""
MEMORY_LIMIT="3g"
MEMORY_SWAP="4g"
SKIP_BUILD=false

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat <<EOF
DevPortal Local Image Build Script

Builds the veecode/devportal Docker image in two steps:
  1. Compile on the host (yarn build:backend)
  2. Package into the image (docker build)

Usage: $0 [OPTIONS]

Options:
  --no-cache         Disable Docker layer caching
  --skip-build       Skip 'yarn build:backend' (use existing dist/ artefacts)
  --memory=<size>    Memory limit for the Docker build (default: 3g)
  --help, -h         Show this help message

Steps (default — both run):
  1. yarn install --immutable && yarn build:backend
     Compiles packages/app + packages/backend on the host (Node, full RAM).
     Generates packages/backend/dist/skeleton.tar.gz + bundle.tar.gz.
  2. docker build
     Packages the pre-built artefacts into the runtime image.
     No compilation inside Docker — fast, minimal, no OOM risk.
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --memory=*)
            MEMORY_LIMIT="${1#*=}"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

if [ ! -f "package.json" ]; then
    print_error "package.json not found. Run this script from the repository root."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

VERSION=$(node -p "require('./package.json').version")

# Step 1 — compile on host (skippable when artefacts are already fresh)
if [ "$SKIP_BUILD" = false ]; then
    print_status "Step 1/2: Building backend artefacts on host (yarn build:backend)..."
    # packages/app webpack peaks well above the default ~2 GB V8 heap limit.
    yarn install --immutable
    NODE_OPTIONS="--max-old-space-size=6144" yarn build:backend
    print_success "Backend artefacts built."
else
    print_warning "--skip-build: skipping yarn build:backend, using existing dist/ artefacts."
fi

# Artefacts must exist regardless of --skip-build
if [ ! -f "packages/backend/dist/skeleton.tar.gz" ] || \
   [ ! -f "packages/backend/dist/bundle.tar.gz" ]; then
    print_error "Artefacts not found in packages/backend/dist/."
    print_error "Run without --skip-build, or run: yarn install --immutable && yarn build:backend"
    exit 1
fi

print_status "Step 2/2: Building Docker image..."
print_status "Image: $IMAGE_NAME"
print_status "Tags : $VERSION, latest"
print_status "Memory limit: $MEMORY_LIMIT (swap: $MEMORY_SWAP)"

DOCKER_ARGS=(
    build
    -f "$DOCKERFILE_PATH"
    --tag "$IMAGE_NAME:$VERSION"
    --tag "$IMAGE_NAME:latest"
    --memory="$MEMORY_LIMIT"
    --memory-swap="$MEMORY_SWAP"
    --progress plain
    --build-arg "DEVPORTAL_VERSION=$VERSION"
)

if [ -n "$NO_CACHE" ]; then
    print_warning "Docker layer cache disabled"
    DOCKER_ARGS+=("--no-cache")
fi

DOCKER_ARGS+=(.)

print_status "Running: docker ${DOCKER_ARGS[*]}"
docker "${DOCKER_ARGS[@]}"

print_success "Build complete: $IMAGE_NAME:$VERSION"
print_status "Run with: docker run -p 7007:7007 $IMAGE_NAME:$VERSION"
