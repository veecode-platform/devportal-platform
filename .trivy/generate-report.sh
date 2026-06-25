#!/usr/bin/env bash
# Generate a markdown summary from a Trivy JSON report.
# Usage: .trivy/generate-report.sh <report.json> <title>
set -euo pipefail

REPORT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Vulnerabilities}"

echo "# ${TITLE}"
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
  ["Severity","ID","Package","Installed","Fixed","Title"],
  ["--------","--","-------","---------","-----","-----"],
  (.Results[]? |
    .Target as $target |
    .Vulnerabilities[]? |
    [.Severity, .VulnerabilityID, .PkgName, .InstalledVersion, (.FixedVersion // "none"), .Title]
  ) | @tsv
' "$REPORT" | awk -F'\t' '{
  printf "| %-10s | %-20s | %-30s | %-15s | %-15s | %s |\n", $1, $2, $3, $4, $5, $6
}'
