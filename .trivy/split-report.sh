#!/usr/bin/env bash
# Split a Trivy JSON report into DevPortal base and dynamic plugins reports.
# Dynamic plugins live under /app/dynamic-plugins-root/ and are maintained by
# upstream projects, so they are separated out for informational purposes only.
#
# Usage: .trivy/split-report.sh <report.json>
set -euo pipefail

REPORT="${1:?Usage: split-report.sh <report.json>}"
DIR="$(dirname "$REPORT")"

# Main report: exclude results whose Target starts with /app/dynamic-plugins-root
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [.Results[]? | select(.Target | startswith("/app/dynamic-plugins-root") | not)]
}' "$REPORT" > "${DIR}/main-report.json"

# Plugins report: only results under /app/dynamic-plugins-root
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [.Results[]? | select(.Target | startswith("/app/dynamic-plugins-root"))]
}' "$REPORT" > "${DIR}/plugins-report.json"

echo "Split complete:"
echo "  ${DIR}/main-report.json  ($(jq '[.Results[]?.Vulnerabilities[]?] | length' "${DIR}/main-report.json") vulns)"
echo "  ${DIR}/plugins-report.json  ($(jq '[.Results[]?.Vulnerabilities[]?] | length' "${DIR}/plugins-report.json") vulns)"
