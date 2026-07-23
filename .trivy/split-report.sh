#!/usr/bin/env bash
# Split a Trivy JSON report into main DevPortal and dynamic-plugins reports.
# Usage: split-report.sh <report.json>
set -euo pipefail

REPORT="${1:?Usage: split-report.sh <report.json>}"
DIR="$(dirname "$REPORT")"

# Dynamic plugins live under /app/dynamic-plugins-root/ inside the image
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root"; "i") | not)
  ]
}' "$REPORT" > "$DIR/main-report.json"

jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root"; "i"))
  ]
}' "$REPORT" > "$DIR/plugins-report.json"

echo "main-report.json:    $(jq '[.Results[]?.Vulnerabilities[]?] | length' "$DIR/main-report.json") vulns"
echo "plugins-report.json: $(jq '[.Results[]?.Vulnerabilities[]?] | length' "$DIR/plugins-report.json") vulns"
