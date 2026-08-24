#!/usr/bin/env bash
# Generate a human-readable markdown report from a Trivy JSON report.

set -euo pipefail

INPUT="${1:?Usage: $0 <trivy-report.json> [title]}"
TITLE="${2:-Security Scan Report}"

echo "# $TITLE"
echo ""
echo "## Summary"
echo ""

jq -r '
  [.Results[]?.Vulnerabilities[]?] |
  group_by(.Severity) |
  map({key: .[0].Severity, value: length}) |
  from_entries |
  "| Severity | Count |\n|----------|-------|\n" +
  (["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"] |
    map(. as $s | "| \($s) | \(($s | . as $k | {"CRITICAL":0,"HIGH":0,"MEDIUM":0,"LOW":0,"UNKNOWN":0}) // 0) |") |
    join("\n"))
' "$INPUT" 2>/dev/null || true

# Per-severity counts
echo ""
echo "| Severity | Count |"
echo "|----------|-------|"
for sev in CRITICAL HIGH MEDIUM LOW UNKNOWN; do
  COUNT=$(jq "[.Results[]?.Vulnerabilities[]? | select(.Severity == \"$sev\")] | length" "$INPUT" 2>/dev/null || echo 0)
  echo "| $sev | $COUNT |"
done

echo ""
echo "## Vulnerabilities with fixes available"
echo ""
jq -r '
  [.Results[]?.Vulnerabilities[]? | select(.FixedVersion != null and .FixedVersion != "")] |
  sort_by(.Severity) | reverse |
  .[] |
  "- **\(.VulnerabilityID)** (\(.Severity)): `\(.PkgName)` \(.InstalledVersion) → \(.FixedVersion)"
' "$INPUT" 2>/dev/null || echo "None"
