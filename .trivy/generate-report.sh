#!/usr/bin/env bash
# Generate a markdown report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> <title>
set -euo pipefail

REPORT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Security Report}"

echo "# $TITLE"
echo ""
echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"

for sev in CRITICAL HIGH MEDIUM LOW UNKNOWN; do
  count=$(jq --arg s "$sev" '[.Results[]?.Vulnerabilities[]? | select(.Severity == $s)] | length' "$REPORT")
  if [ "$count" -gt 0 ]; then
    echo "| $sev | $count |"
  fi
done

echo ""
echo "## Vulnerabilities"
echo ""

jq -r '
  .Results[]? |
  . as $result |
  .Vulnerabilities[]? |
  . as $vuln |
  "### \(.VulnerabilityID) — \(.Severity)\n" +
  "- **Package**: `\(.PkgName)` \(.InstalledVersion)\n" +
  "- **Fixed in**: \(if .FixedVersion != null and .FixedVersion != "" then "`" + .FixedVersion + "`" else "no fix available" end)\n" +
  "- **Target**: `\($result.Target)`\n" +
  (if .Title != null then "- **Title**: \(.Title)\n" else "" end) +
  (if .Description != null and (.Description | length) > 0 then "- **Description**: \(.Description | .[0:200])\n" else "" end) +
  ""
' "$REPORT"
