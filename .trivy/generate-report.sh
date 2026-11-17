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

# Count by severity
python3 -I - "$REPORT" <<'PY'
import json, sys, collections

with open(sys.argv[1]) as f:
    data = json.load(f)

counts = collections.Counter()
vulns_by_sev = collections.defaultdict(list)

for result in data.get("Results", []):
    for v in result.get("Vulnerabilities") or []:
        sev = v.get("Severity", "UNKNOWN")
        counts[sev] += 1
        vulns_by_sev[sev].append({
            "id": v.get("VulnerabilityID", ""),
            "pkg": v.get("PkgName", ""),
            "installed": v.get("InstalledVersion", ""),
            "fixed": v.get("FixedVersion", ""),
            "title": v.get("Title", ""),
            "target": result.get("Target", ""),
        })

order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]

print("| Severity | Count |")
print("| -------- | ----- |")
for sev in order:
    if counts[sev]:
        print(f"| {sev.capitalize()} | {counts[sev]} |")
print()

for sev in order:
    vulns = vulns_by_sev.get(sev, [])
    if not vulns:
        continue
    print(f"## {sev.capitalize()} ({len(vulns)})")
    print()
    print("| CVE | Package | Installed | Fixed | Title |")
    print("| --- | ------- | --------- | ----- | ----- |")
    for v in sorted(vulns, key=lambda x: x["pkg"]):
        fixed = v["fixed"] or "—"
        title = v["title"][:60] if v["title"] else "—"
        print(f"| {v['id']} | {v['pkg']} | {v['installed']} | {fixed} | {title} |")
    print()
PY
