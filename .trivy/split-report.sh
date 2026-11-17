#!/usr/bin/env bash
# Split a Trivy JSON report into main DevPortal and dynamic-plugins sub-reports.
# Usage: split-report.sh <report.json>
set -euo pipefail

REPORT="${1:?Usage: split-report.sh <report.json>}"
DIR="$(dirname "$REPORT")"

# Main report: results whose Target does NOT contain dynamic-plugins-root/
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root/") | not)
  ]
}' "$REPORT" > "$DIR/main-report.json"

# Plugins report: results whose Target contains dynamic-plugins-root/
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root/"))
  ]
}' "$REPORT" > "$DIR/plugins-report.json"

echo "Split complete: main-report.json + plugins-report.json written to $DIR/"
