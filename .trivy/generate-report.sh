#!/usr/bin/env bash
# Generate a markdown report from a Trivy JSON report.
# Usage: generate-report.sh <report.json> <title>

set -euo pipefail

REPORT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Security Report}"

echo "# $TITLE"
echo ""
echo "## Summary"
echo ""

jq -r '
  [.Results[]?.Vulnerabilities[]?]
  | group_by(.Severity)
  | map({severity: .[0].Severity, count: length})
  | sort_by(
      if .severity == "CRITICAL" then 0
      elif .severity == "HIGH" then 1
      elif .severity == "MEDIUM" then 2
      elif .severity == "LOW" then 3
      else 4 end
    )
  | ["| Severity | Count |", "| --- | --- |"]
    + map("| \(.severity) | \(.count) |")
  | .[]
' "$REPORT"

echo ""
echo "## Vulnerabilities"
echo ""
echo "| ID | Package | Severity | Installed | Fixed |"
echo "| --- | --- | --- | --- | --- |"

jq -r '
  [.Results[]?.Vulnerabilities[]?]
  | sort_by(
      if .Severity == "CRITICAL" then 0
      elif .Severity == "HIGH" then 1
      elif .Severity == "MEDIUM" then 2
      elif .Severity == "LOW" then 3
      else 4 end
    )
  | .[]
  | "| \(.VulnerabilityID) | \(.PkgName) | \(.Severity) | \(.InstalledVersion) | \(.FixedVersion // "none") |"
' "$REPORT"
