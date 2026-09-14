#!/usr/bin/env bash
# Generate a markdown vulnerability report from a Trivy JSON report.
set -euo pipefail

INPUT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Security Report}"

echo "# $TITLE — Vulnerability Report"
echo ""
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Severity counts
echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "|----------|-------|"
for sev in CRITICAL HIGH MEDIUM LOW UNKNOWN; do
  count=$(jq --arg s "$sev" '[.Results[]?.Vulnerabilities[]? | select(.Severity == $s)] | length' "$INPUT")
  echo "| $sev | $count |"
done
echo ""

# Fixable counts
fixable=$(jq '[.Results[]?.Vulnerabilities[]? | select(.FixedVersion != null and .FixedVersion != "")] | length' "$INPUT")
echo "**Fixable:** $fixable"
echo ""

# Detail table: only show Critical and High
echo "## Critical & High Vulnerabilities"
echo ""
echo "| ID | Package | Severity | Installed | Fixed | Target |"
echo "|----|---------|----------|-----------|-------|--------|"
jq -r '
  .Results[]? as $r |
  $r.Vulnerabilities[]? |
  select(.Severity == "CRITICAL" or .Severity == "HIGH") |
  "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion // "none") | \($r.Target) |"
' "$INPUT"
echo ""

echo "## All Fixable Vulnerabilities"
echo ""
echo "| ID | Package | Severity | Installed | Fixed | Target |"
echo "|----|---------|----------|-----------|-------|--------|"
jq -r '
  .Results[]? as $r |
  $r.Vulnerabilities[]? |
  select(.FixedVersion != null and .FixedVersion != "") |
  select(.Severity != "CRITICAL" and .Severity != "HIGH") |
  "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion) | \($r.Target) |"
' "$INPUT"
