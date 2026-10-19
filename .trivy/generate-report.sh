#!/usr/bin/env bash
# Generate a markdown summary from a Trivy JSON report.
# Usage: .trivy/generate-report.sh <report.json> <title>
set -euo pipefail

INPUT="${1:-}"
TITLE="${2:-Vulnerability Report}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 <report.json> [title]" >&2
  exit 1
fi

python3 - "$INPUT" "$TITLE" <<'EOF'
import json, sys
from collections import defaultdict

with open(sys.argv[1]) as f:
    report = json.load(f)

title = sys.argv[2]
counts = defaultdict(int)
vuln_rows = []

for result in report.get("Results", []):
    for v in result.get("Vulnerabilities", []):
        sev = v.get("Severity", "UNKNOWN")
        counts[sev] += 1
        fix = v.get("FixedVersion", "")
        vuln_rows.append({
            "id": v.get("VulnerabilityID", ""),
            "pkg": v.get("PkgName", ""),
            "severity": sev,
            "installed": v.get("InstalledVersion", ""),
            "fixed": fix,
            "target": result.get("Target", ""),
        })

print(f"## {title}")
print()
print("### Severity Summary")
print()
print("| Severity | Count |")
print("| -------- | ----- |")
for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]:
    if counts[sev]:
        print(f"| {sev.capitalize()} | {counts[sev]} |")
print()

if vuln_rows:
    print("### Vulnerabilities")
    print()
    print("| CVE | Package | Severity | Installed | Fixed |")
    print("| --- | ------- | -------- | --------- | ----- |")
    for v in sorted(vuln_rows, key=lambda x: ["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"].index(x["severity"]) if x["severity"] in ["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"] else 99):
        fixed = v["fixed"] if v["fixed"] else "—"
        print(f"| {v['id']} | {v['pkg']} | {v['severity']} | {v['installed']} | {fixed} |")
else:
    print("No vulnerabilities found.")
EOF
