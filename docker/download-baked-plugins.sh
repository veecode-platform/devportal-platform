#!/usr/bin/env bash
#
# Downloads the npm-published dynamic plugins listed in
# `docker/baked-plugins.json` and extracts each one into its own subdirectory
# under the target directory. The result mirrors the directory layout that
# `install-dynamic-plugins.py` expects under `/app/dynamic-plugins-root/`,
# so the Dockerfile's pre-install loop can copy entries straight across.
#
# Usage: download-baked-plugins.sh <target-dir>
# Example: download-baked-plugins.sh /build/dynamic-plugins-store
#
# Only used at image build time. Plugins served via OCI references live in
# `dynamic-plugins.default.yaml`/`presets/` and are fetched at boot by
# `install-dynamic-plugins.py`; this script handles only the small set of
# legacy npm-packed plugins still baked into the image.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <target-dir>" >&2
  exit 1
fi

TARGET_DIR="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_JSON="${SCRIPT_DIR}/baked-plugins.json"

if [ ! -f "${PLUGINS_JSON}" ]; then
  echo "ERROR: ${PLUGINS_JSON} not found" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

while IFS=$'\t' read -r PACKAGE_NAME PACKAGE_VERSION; do
  echo "==> ${PACKAGE_NAME}@${PACKAGE_VERSION}"
  npm pack "${PACKAGE_NAME}@${PACKAGE_VERSION}" \
    --pack-destination "${TMP_DIR}" --quiet
  TARBALL="$(ls -1 "${TMP_DIR}"/*.tgz | head -n1)"
  EXTRACT_NAME="${PACKAGE_NAME#@}"
  EXTRACT_NAME="${EXTRACT_NAME//\//-}"
  DEST="${TARGET_DIR}/${EXTRACT_NAME}"
  rm -rf "${DEST}"
  mkdir -p "${DEST}"
  tar -xzf "${TARBALL}" -C "${DEST}" --strip-components=1
  rm -f "${TARBALL}"
done < <(jq -r '.plugins[] | "\(.name)\t\(.version)"' "${PLUGINS_JSON}")

echo "Done. Extracted plugins to ${TARGET_DIR}"
