#!/usr/bin/env bash
# Split a Trivy JSON report into main (DevPortal) and dynamic-plugins parts.
# Usage: split-report.sh <report.json>
set -euo pipefail

REPORT="${1:?Usage: split-report.sh <report.json>}"
DIR="$(dirname "$REPORT")"

# Dynamic plugins live under /app/dynamic-plugins-root/
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [.Results[]? | select(.Target | test("dynamic-plugins-root"))]
}' "$REPORT" > "$DIR/plugins-report.json"

jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [.Results[]? | select(.Target | test("dynamic-plugins-root") | not)]
}' "$REPORT" > "$DIR/main-report.json"

echo "Split complete:"
echo "  main-report.json:    $(jq '[.Results[]?.Vulnerabilities[]?] | length' "$DIR/main-report.json") vulnerabilities"
echo "  plugins-report.json: $(jq '[.Results[]?.Vulnerabilities[]?] | length' "$DIR/plugins-report.json") vulnerabilities"
