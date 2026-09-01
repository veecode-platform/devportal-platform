#!/usr/bin/env bash
# Split a Trivy JSON report into main DevPortal and dynamic plugins reports.
# Usage: split-report.sh <report.json>

set -euo pipefail

REPORT="${1:?Usage: split-report.sh <report.json>}"
DIR="$(dirname "$REPORT")"

# Dynamic plugins live under /app/dynamic-plugins-root/ in the image
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root") | not)
  ]
}' "$REPORT" > "$DIR/main-report.json"

jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root"))
  ]
}' "$REPORT" > "$DIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json written to $DIR"
