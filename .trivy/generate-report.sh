#!/usr/bin/env bash
# Generate a markdown vulnerability report from a Trivy JSON file.
set -euo pipefail

INPUT="${1:-}"
TITLE="${2:-Vulnerability Report}"
if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 <report.json> [title]" >&2
  exit 1
fi

echo "# $TITLE"
echo ""

# Count by severity
for SEV in CRITICAL HIGH MEDIUM LOW; do
  COUNT=$(jq "[.Results[]? | .Vulnerabilities[]? | select(.Severity == \"$SEV\")] | length" "$INPUT")
  echo "- $SEV: $COUNT"
done

echo ""
echo "## Vulnerabilities with fixes available"
echo ""
echo "| CVE | Package | Severity | Installed | Fixed |"
echo "|-----|---------|----------|-----------|-------|"

jq -r '.Results[]? | .Vulnerabilities[]? | select(.FixedVersion != null and .FixedVersion != "") |
  "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion) |"' "$INPUT"

echo ""
echo "## Vulnerabilities without fixes"
echo ""
echo "| CVE | Package | Severity | Installed |"
echo "|-----|---------|----------|-----------|"

jq -r '.Results[]? | .Vulnerabilities[]? | select(.FixedVersion == null or .FixedVersion == "") |
  "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) |"' "$INPUT"
