#!/usr/bin/env bash
# Split a Trivy JSON report into main-report.json and plugins-report.json
# Usage: split-report.sh <input-report.json>

set -euo pipefail

INPUT="${1:?Usage: split-report.sh <input-report.json>}"
DIR="$(dirname "$INPUT")"

# Main report: everything NOT under dynamic-plugins-root
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root") | not)
  ]
}' "$INPUT" > "$DIR/main-report.json"

# Plugins report: only dynamic-plugins-root paths
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]?
    | select(.Target | test("dynamic-plugins-root"))
  ]
}' "$INPUT" > "$DIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json written to $DIR"
