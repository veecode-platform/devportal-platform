#!/usr/bin/env bash
# Split a Trivy JSON report into:
#   main-report.json    - DevPortal base vulnerabilities (actionable)
#   plugins-report.json - Dynamic plugin vulnerabilities (upstream)
set -euo pipefail

REPORT="${1:-.trivyscan/report.json}"
DIR="$(dirname "$REPORT")"

# Main report: exclude anything under dynamic-plugins-root
jq '
  .Results = [
    .Results[]? |
    select(.Target | test("dynamic-plugins-root") | not)
  ]
' "$REPORT" > "$DIR/main-report.json"

# Plugins report: only dynamic-plugins-root targets
jq '
  .Results = [
    .Results[]? |
    select(.Target | test("dynamic-plugins-root"))
  ]
' "$REPORT" > "$DIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json written to $DIR"
