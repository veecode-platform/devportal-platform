#!/usr/bin/env bash
# Generate a human-readable markdown report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> <title>
set -euo pipefail

REPORT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Vulnerability Report}"

# Count by severity
critical=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$REPORT")
high=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH")] | length' "$REPORT")
medium=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "MEDIUM")] | length' "$REPORT")
low=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "LOW")] | length' "$REPORT")
total=$((critical + high + medium + low))

echo "# $TITLE"
echo ""
echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"
echo "| Critical | $critical |"
echo "| High     | $high |"
echo "| Medium   | $medium |"
echo "| Low      | $low |"
echo "| **Total**| **$total** |"
echo ""

if [ "$total" -eq 0 ]; then
  echo "No vulnerabilities found."
  exit 0
fi

echo "## Vulnerabilities"
echo ""

jq -r '
  .Results[]? |
  .Target as $target |
  .Vulnerabilities[]? |
  "### \(.VulnerabilityID) (\(.Severity))\n" +
  "- **Package**: \(.PkgName) \(.InstalledVersion)\n" +
  "- **Target**: \($target)\n" +
  (if .FixedVersion != null and .FixedVersion != "" then "- **Fixed in**: \(.FixedVersion)\n" else "- **Fix**: Not available\n" end) +
  (if .Title != null then "- **Title**: \(.Title)\n" else "" end) +
  ""
' "$REPORT"
