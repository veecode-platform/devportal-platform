#!/usr/bin/env bash
# Generate a human-readable markdown report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> [title]
set -euo pipefail

REPORT="${1:-.trivyscan/main-report.json}"
TITLE="${2:-DevPortal Base}"

count_severity() {
  local sev="$1"
  jq --arg s "$sev" '[.Results[]? | .Vulnerabilities[]? | select(.Severity == $s)] | length' "$REPORT"
}

CRITICAL=$(count_severity "CRITICAL")
HIGH=$(count_severity "HIGH")
MEDIUM=$(count_severity "MEDIUM")
LOW=$(count_severity "LOW")

echo "# Trivy Security Report — $TITLE"
echo ""
echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"
echo "| Critical | $CRITICAL |"
echo "| High     | $HIGH |"
echo "| Medium   | $MEDIUM |"
echo "| Low      | $LOW |"
echo ""

if [ "$((CRITICAL + HIGH))" -gt 0 ]; then
  echo "## Critical / High Vulnerabilities"
  echo ""
  echo "| CVE | Package | Installed | Fixed | Severity |"
  echo "| --- | ------- | --------- | ----- | -------- |"
  jq -r '
    .Results[]? | .Vulnerabilities[]? |
    select(.Severity == "CRITICAL" or .Severity == "HIGH") |
    "| \(.VulnerabilityID) | \(.PkgName) | \(.InstalledVersion) | \(.FixedVersion // "none") | \(.Severity) |"
  ' "$REPORT"
  echo ""
fi

if [ "$MEDIUM" -gt 0 ]; then
  echo "## Medium Vulnerabilities"
  echo ""
  echo "| CVE | Package | Installed | Fixed |"
  echo "| --- | ------- | --------- | ----- |"
  jq -r '
    .Results[]? | .Vulnerabilities[]? |
    select(.Severity == "MEDIUM") |
    "| \(.VulnerabilityID) | \(.PkgName) | \(.InstalledVersion) | \(.FixedVersion // "none") |"
  ' "$REPORT"
  echo ""
fi

if [ "$LOW" -gt 0 ]; then
  echo "## Low Vulnerabilities"
  echo ""
  echo "| CVE | Package | Installed | Fixed |"
  echo "| --- | ------- | --------- | ----- |"
  jq -r '
    .Results[]? | .Vulnerabilities[]? |
    select(.Severity == "LOW") |
    "| \(.VulnerabilityID) | \(.PkgName) | \(.InstalledVersion) | \(.FixedVersion // "none") |"
  ' "$REPORT"
  echo ""
fi
