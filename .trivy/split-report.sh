#!/usr/bin/env bash
# Split a Trivy JSON report into two reports:
#   main-report.json    — DevPortal base (excludes dynamic-plugins-root)
#   plugins-report.json — Dynamic plugins only (dynamic-plugins-root)
set -euo pipefail

REPORT="${1:-.trivyscan/report.json}"
DIR="$(dirname "$REPORT")"

jq '{
  SchemaVersion: .SchemaVersion,
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
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [
    .Results[]? |
    select(.Target | test("dynamic-plugins-root"))
  ]
}' "$REPORT" > "$DIR/plugins-report.json"

echo "Split complete:"
echo "  main-report.json:    $(jq '[.Results[]?.Vulnerabilities[]?] | length' "$DIR/main-report.json") vulnerabilities"
echo "  plugins-report.json: $(jq '[.Results[]?.Vulnerabilities[]?] | length' "$DIR/plugins-report.json") vulnerabilities"
