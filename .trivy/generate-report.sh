#!/usr/bin/env bash
# Generate a markdown vulnerability report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> [title]
set -euo pipefail

REPORT="${1:-.trivyscan/main-report.json}"
TITLE="${2:-Vulnerability Report}"

echo "# $TITLE"
echo ""

# Count by severity
CRITICAL=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' "$REPORT")
HIGH=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH")] | length' "$REPORT")
MEDIUM=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="MEDIUM")] | length' "$REPORT")
LOW=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="LOW")] | length' "$REPORT")
TOTAL=$((CRITICAL + HIGH + MEDIUM + LOW))

echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"
echo "| Critical | $CRITICAL |"
echo "| High     | $HIGH |"
echo "| Medium   | $MEDIUM |"
echo "| Low      | $LOW |"
echo "| **Total**| **$TOTAL** |"
echo ""

if [ "$TOTAL" -eq 0 ]; then
  echo "No vulnerabilities found."
  exit 0
fi

echo "## Vulnerabilities"
echo ""
echo "| CVE | Package | Severity | Installed | Fixed |"
echo "| --- | ------- | -------- | --------- | ----- |"

jq -r '
  [.Results[]?.Vulnerabilities[]?] |
  sort_by(
    if .Severity == "CRITICAL" then 0
    elif .Severity == "HIGH" then 1
    elif .Severity == "MEDIUM" then 2
    else 3 end
  ) |
  .[] |
  "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion // "none") |"
' "$REPORT"
