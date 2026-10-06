#!/usr/bin/env bash
# Generate a markdown vulnerability report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> <title>
set -euo pipefail

REPORT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Security Report}"

count_sev() {
  jq --arg sev "$1" \
    '[.Results[]?.Vulnerabilities[]? | select(.Severity == $sev)] | length' \
    "$REPORT"
}

CRITICAL=$(count_sev CRITICAL)
HIGH=$(count_sev HIGH)
MEDIUM=$(count_sev MEDIUM)
LOW=$(count_sev LOW)

echo "## $TITLE"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"
echo "| Critical | $CRITICAL |"
echo "| High     | $HIGH |"
echo "| Medium   | $MEDIUM |"
echo "| Low      | $LOW |"
echo ""

if [ "$((CRITICAL + HIGH))" -gt 0 ]; then
  echo "### Critical & High Vulnerabilities"
  echo ""
  echo "| ID | Package | Severity | Installed | Fixed |"
  echo "| -- | ------- | -------- | --------- | ----- |"
  jq -r '
    .Results[]?.Vulnerabilities[]?
    | select(.Severity == "CRITICAL" or .Severity == "HIGH")
    | "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion // "none") |"
  ' "$REPORT" | sort -u
fi
