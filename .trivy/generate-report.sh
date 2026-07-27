#!/usr/bin/env bash
# Generate a Markdown report from a Trivy JSON report
# Usage: generate-report.sh <report.json> <title>

set -euo pipefail

INPUT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Security Report}"

echo "# $TITLE"
echo ""
echo "## Summary"
echo ""

# Count by severity
CRITICAL=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$INPUT")
HIGH=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "HIGH")] | length' "$INPUT")
MEDIUM=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "MEDIUM")] | length' "$INPUT")
LOW=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.Severity == "LOW")] | length' "$INPUT")

echo "| Severity | Count |"
echo "| -------- | ----- |"
echo "| Critical | $CRITICAL |"
echo "| High     | $HIGH |"
echo "| Medium   | $MEDIUM |"
echo "| Low      | $LOW |"
echo ""

# List all vulnerabilities with fix available
FIXABLE=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.FixedVersion != null and .FixedVersion != "")]' "$INPUT")
FIXABLE_COUNT=$(echo "$FIXABLE" | jq 'length')

if [ "$FIXABLE_COUNT" -gt 0 ]; then
  echo "## Fixable Vulnerabilities ($FIXABLE_COUNT)"
  echo ""
  echo "| ID | Package | Severity | Installed | Fixed |"
  echo "| -- | ------- | -------- | --------- | ----- |"
  echo "$FIXABLE" | jq -r '.[] | "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion) |"'
  echo ""
fi

# List all vulnerabilities without fix
UNFIXABLE=$(jq '[.Results[]? | .Vulnerabilities[]? | select(.FixedVersion == null or .FixedVersion == "")]' "$INPUT")
UNFIXABLE_COUNT=$(echo "$UNFIXABLE" | jq 'length')

if [ "$UNFIXABLE_COUNT" -gt 0 ]; then
  echo "## Vulnerabilities Without Fix ($UNFIXABLE_COUNT)"
  echo ""
  echo "| ID | Package | Severity | Installed |"
  echo "| -- | ------- | -------- | --------- |"
  echo "$UNFIXABLE" | jq -r '.[] | "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) |"'
  echo ""
fi
