#!/usr/bin/env bash
# Generate a human-readable Markdown security report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> <title>
set -euo pipefail

REPORT="${1:-.trivyscan/main-report.json}"
TITLE="${2:-Security Report}"

echo "# $TITLE — Security Report"
echo ""
echo "Generated: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo ""

# Severity counts
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

echo "## Vulnerabilities with Fixes Available"
echo ""
echo "| CVE | Package | Severity | Installed | Fixed |"
echo "| --- | ------- | -------- | --------- | ----- |"

jq -r '
  [.Results[]?.Vulnerabilities[]? |
   select(.FixedVersion != null and .FixedVersion != "") |
   "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion) |"]
  | sort | .[]
' "$REPORT"

echo ""
echo "## Vulnerabilities without Fixes"
echo ""
echo "| CVE | Package | Severity | Installed |"
echo "| --- | ------- | -------- | --------- |"

jq -r '
  [.Results[]?.Vulnerabilities[]? |
   select(.FixedVersion == null or .FixedVersion == "") |
   "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) |"]
  | sort | .[]
' "$REPORT"
