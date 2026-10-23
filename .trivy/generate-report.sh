#!/bin/bash
# Generate a markdown report from a trivy JSON report
set -e

INPUT="$1"
LABEL="${2:-Scan Results}"

if [ -z "$INPUT" ]; then
    echo "Usage: generate-report.sh <report.json> [label]" >&2
    exit 1
fi

echo "# $LABEL"
echo ""
echo "## Summary"
echo ""
echo "| Severity | Count |"
echo "| -------- | ----- |"

for sev in CRITICAL HIGH MEDIUM LOW UNKNOWN; do
    count=$(jq "[.Results[]? | .Vulnerabilities[]? | select(.Severity == \"$sev\")] | length" "$INPUT")
    echo "| $sev | $count |"
done

echo ""
echo "## Vulnerabilities with Fixes"
echo ""

jq -r '.Results[]? | .Target as $target | .Vulnerabilities[]? | select(.FixedVersion != null and .FixedVersion != "") | "| \(.VulnerabilityID) | \(.Severity) | \(.PkgName) | \(.InstalledVersion) | \(.FixedVersion) | \($target) |"' "$INPUT" | sort | uniq | \
  (echo "| CVE | Severity | Package | Installed | Fixed | Target |"; echo "| --- | -------- | ------- | --------- | ----- | ------ |"; cat)

echo ""
echo "## All Vulnerabilities"
echo ""
jq -r '.Results[]? | .Target as $target | .Vulnerabilities[]? | "| \(.VulnerabilityID) | \(.Severity) | \(.PkgName) | \(.InstalledVersion) | \(.FixedVersion // "none") |"' "$INPUT" | sort | uniq | \
  (echo "| CVE | Severity | Package | Installed | Fixed |"; echo "| --- | -------- | ------- | --------- | ----- |"; cat)
