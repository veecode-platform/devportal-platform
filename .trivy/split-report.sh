#!/usr/bin/env bash
# Split a Trivy JSON report into main-report.json and plugins-report.json.
# Results in dynamic-plugins-root/ are upstream-maintained; all others are actionable here.

set -euo pipefail

INPUT="${1:?Usage: $0 <trivy-report.json>}"
DIR="$(dirname "$INPUT")"

jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Results: [
    .Results[]? |
    select(.Target | test("dynamic-plugins-root") | not)
  ]
}' "$INPUT" > "$DIR/main-report.json"

jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Results: [
    .Results[]? |
    select(.Target | test("dynamic-plugins-root"))
  ]
}' "$INPUT" > "$DIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json written to $DIR"
