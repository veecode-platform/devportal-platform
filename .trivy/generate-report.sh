#!/usr/bin/env bash
# Generate a human-readable markdown report from a Trivy JSON report.
set -euo pipefail

REPORT="${1:-.trivyscan/main-report.json}"
LABEL="${2:-DevPortal Base}"

if [ ! -f "$REPORT" ]; then
  echo "Error: report file not found: $REPORT" >&2
  exit 1
fi

python3 - "$REPORT" "$LABEL" <<'PYEOF'
import sys, json
from collections import defaultdict

report_path = sys.argv[1]
label       = sys.argv[2]

with open(report_path) as f:
    data = json.load(f)

counts  = defaultdict(int)
details = []

for result in data.get("Results", []):
    for vuln in result.get("Vulnerabilities") or []:
        sev = vuln.get("Severity", "UNKNOWN")
        counts[sev] += 1
        details.append({
            "id":        vuln.get("VulnerabilityID", ""),
            "pkg":       vuln.get("PkgName", ""),
            "severity":  sev,
            "installed": vuln.get("InstalledVersion", ""),
            "fixed":     vuln.get("FixedVersion", ""),
            "title":     vuln.get("Title", ""),
        })

details.sort(key=lambda v: ["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"].index(v["severity"]) if v["severity"] in ["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"] else 99)

print(f"# {label} — Vulnerability Report\n")
print("## Summary\n")
print("| Severity | Count |")
print("| -------- | ----- |")
for sev in ["CRITICAL","HIGH","MEDIUM","LOW","UNKNOWN"]:
    if counts[sev]:
        print(f"| {sev.capitalize()} | {counts[sev]} |")
print()

if details:
    print("## Vulnerabilities\n")
    print("| ID | Package | Severity | Installed | Fixed | Title |")
    print("| -- | ------- | -------- | --------- | ----- | ----- |")
    for v in details:
        fixed = v["fixed"] or "—"
        print(f"| {v['id']} | {v['pkg']} | {v['severity']} | {v['installed']} | {fixed} | {v['title'][:60]} |")
else:
    print("No vulnerabilities found.")
PYEOF
