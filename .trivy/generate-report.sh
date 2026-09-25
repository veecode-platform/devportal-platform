#!/usr/bin/env bash
# Generate a human-readable Markdown report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> <title>
set -euo pipefail

REPORT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Security Report}"

echo "# $TITLE — Trivy Security Report"
echo ""
echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"
for sev in CRITICAL HIGH MEDIUM LOW UNKNOWN; do
  count=$(jq --arg sev "$sev" '[.Results[]?.Vulnerabilities[]? | select(.Severity == $sev)] | length' "$REPORT")
  echo "| $sev | $count |"
done

echo ""
echo "## Vulnerabilities with fixes available"
echo ""
echo "| ID | Package | Severity | Installed | Fixed |"
echo "| -- | ------- | -------- | --------- | ----- |"
jq -r '.Results[]?.Vulnerabilities[]? | select(.FixedVersion != null and .FixedVersion != "") | "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion) |"' "$REPORT" | sort -t'|' -k4,4r

echo ""
echo "## All vulnerabilities"
echo ""
echo "| ID | Package | Severity | Installed | Fixed | Title |"
echo "| -- | ------- | -------- | --------- | ----- | ----- |"
jq -r '.Results[]?.Vulnerabilities[]? | "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion // "none") | \(.Title // "") |"' "$REPORT" | sort -t'|' -k4,4r
