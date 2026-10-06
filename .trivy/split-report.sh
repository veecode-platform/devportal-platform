#!/usr/bin/env bash
# Split a Trivy JSON report into base DevPortal and dynamic-plugins-root.
# Usage: split-report.sh <report.json>
set -euo pipefail

REPORT="${1:?Usage: split-report.sh <report.json>}"
OUT_DIR="$(dirname "$REPORT")"

# Main report: everything NOT under dynamic-plugins-root
jq '[.Results[]? | select(.Target | test("dynamic-plugins-root") | not)] | {SchemaVersion: 2, Results: .}' \
  "$REPORT" > "$OUT_DIR/main-report.json"

# Plugins report: only dynamic-plugins-root entries
jq '[.Results[]? | select(.Target | test("dynamic-plugins-root"))] | {SchemaVersion: 2, Results: .}' \
  "$REPORT" > "$OUT_DIR/plugins-report.json"

echo "Split complete:"
echo "  main-report.json    ($(jq '[.Results[]?.Vulnerabilities[]?] | length' "$OUT_DIR/main-report.json") vulns)"
echo "  plugins-report.json ($(jq '[.Results[]?.Vulnerabilities[]?] | length' "$OUT_DIR/plugins-report.json") vulns)"
