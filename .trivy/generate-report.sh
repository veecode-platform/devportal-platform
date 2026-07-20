#!/usr/bin/env bash
set -euo pipefail
REPORT="$1"
TITLE="${2:-Report}"

echo "# $TITLE Security Report"
echo ""

# Count by severity
CRITICAL=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$REPORT")
HIGH=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "HIGH")] | length' "$REPORT")
MEDIUM=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "MEDIUM")] | length' "$REPORT")
LOW=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "LOW")] | length' "$REPORT")

echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"
echo "| Critical | $CRITICAL |"
echo "| High     | $HIGH |"
echo "| Medium   | $MEDIUM |"
echo "| Low      | $LOW |"
echo ""

echo "## High and Critical Vulnerabilities"
echo ""
jq -r '.Results[]? | .Vulnerabilities[]? | select(.Severity == "CRITICAL" or .Severity == "HIGH") | "- **\(.VulnerabilityID)** (\(.Severity)) — \(.PkgName) \(.InstalledVersion) → \(.FixedVersion // "no fix")"' "$REPORT" | sort -u
