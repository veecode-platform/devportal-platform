#!/bin/bash
set -e

# DevPortal POC Local Image Build Script
#
# The unified Dockerfile is self-contained: it runs yarn install + build +
# dynamic-plugin export inside the builder stage. No pre-build artifacts
# need to exist in the host workspace.
#
# Usage:
#   ./scripts/build-local-image.sh [OPTIONS]
#
# Options:
#   --no-cache       Disable Docker layer caching
#   --memory=<size>  Override memory limit (default: 4g, recommended for WSL)
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

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat <<EOF
DevPortal POC Local Image Build Script

Builds the unified veecode/devportal Docker image. The Dockerfile is
self-contained — no host-side pre-build steps required.

Usage: $0 [OPTIONS]

Options:
  --no-cache         Disable Docker layer caching
  --memory=<size>    Memory limit for the build (default: 4g; WSL hosts
                     should not exceed available RAM minus overhead)
  --help, -h         Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE="--no-cache"
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
