#!/usr/bin/env bash
# Split a Trivy JSON report into main (DevPortal base) and plugins sections.
# Usage: split-report.sh <report.json>
# Outputs: main-report.json and plugins-report.json alongside the input file.
set -euo pipefail

REPORT="${1:?Usage: split-report.sh <report.json>}"
DIR="$(dirname "$REPORT")"

# Dynamic plugins are installed under /app/dynamic-plugins-root/
# Everything else is the DevPortal base image.
jq '{
  SchemaVersion: .SchemaVersion,
  CreatedAt: .CreatedAt,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]? |
    select(.Target | test("dynamic-plugins-root") | not)
  ]
}' "$REPORT" > "$DIR/main-report.json"

jq '{
  SchemaVersion: .SchemaVersion,
  CreatedAt: .CreatedAt,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]? |
    select(.Target | test("dynamic-plugins-root"))
  ]
}' "$REPORT" > "$DIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json written to $DIR"
