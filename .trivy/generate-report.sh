#!/bin/bash
# Generate markdown report from a trivy JSON report
INPUT="$1"
TITLE="${2:-Report}"

if [ -z "$INPUT" ]; then
  echo "Usage: $0 <report.json> [title]"
  exit 1
fi

echo "# Trivy Security Report: $TITLE"
echo ""
echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"

CRITICAL=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$INPUT")
HIGH=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "HIGH")] | length' "$INPUT")
MEDIUM=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "MEDIUM")] | length' "$INPUT")
LOW=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "LOW")] | length' "$INPUT")

echo "| Critical | $CRITICAL |"
echo "| High     | $HIGH |"
echo "| Medium   | $MEDIUM |"
echo "| Low      | $LOW |"

echo ""
echo "## Vulnerabilities with Fixes Available"
echo ""
jq -r '.Results[]? | .Vulnerabilities[]? | select(.FixedVersion != null and .FixedVersion != "") | "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion) |"' "$INPUT" | sort -t'|' -k3 | head -100
