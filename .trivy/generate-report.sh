#!/usr/bin/env bash
# Generate a human-readable markdown report from a Trivy JSON report.
#
# Usage: generate-report.sh <report.json> <title>

set -euo pipefail

INPUT="${1:?Usage: generate-report.sh <report.json> <title>}"
TITLE="${2:-Security Report}"

jq -r --arg title "$TITLE" '
def severity_order: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4};

# Count by severity
[.Results[]?.Vulnerabilities[]?] as $all |
($all | group_by(.Severity) | map({key: .[0].Severity, value: length}) | from_entries) as $counts |

"## \($title)\n",
"| Severity | Count |",
"| -------- | ----- |",
"| Critical | \($counts.CRITICAL // 0) |",
"| High     | \($counts.HIGH // 0) |",
"| Medium   | \($counts.MEDIUM // 0) |",
"| Low      | \($counts.LOW // 0) |",
"",
"### Vulnerabilities\n",
(
  [.Results[]? |
    .Target as $target |
    (.Vulnerabilities // [])[] |
    {
      id: .VulnerabilityID,
      pkg: .PkgName,
      severity: .Severity,
      installed: .InstalledVersion,
      fixed: (.FixedVersion // "no fix"),
      target: $target,
      title: (.Title // "")
    }
  ] |
  sort_by([.severity | severity_order, .id]) |
  .[] |
  "| \(.id) | \(.pkg) | \(.severity) | \(.installed) | \(.fixed) | \(.title) |"
) as $rows |
"| CVE | Package | Severity | Installed | Fixed | Title |",
"| --- | ------- | -------- | --------- | ----- | ----- |",
$rows
' "$INPUT"
