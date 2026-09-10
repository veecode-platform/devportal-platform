#!/bin/bash
# Generate a markdown report from a trivy JSON scan report

set -euo pipefail

INPUT="$1"
TITLE="${2:-Security Scan Report}"

if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file '$INPUT' not found" >&2
    exit 1
fi

python3 << PYEOF
import json, sys, datetime

with open('$INPUT') as f:
    data = json.load(f)

results = data.get('Results', [])
artifact = data.get('ArtifactName', 'unknown')

# Collect all vulnerabilities
all_vulns = []
for result in results:
    target = result.get('Target', '')
    for vuln in result.get('Vulnerabilities') or []:
        all_vulns.append({**vuln, '_target': target})

# Count by severity
counts = {'CRITICAL': 0, 'HIGH': 0, 'MEDIUM': 0, 'LOW': 0, 'UNKNOWN': 0}
for v in all_vulns:
    sev = v.get('Severity', 'UNKNOWN')
    counts[sev] = counts.get(sev, 0) + 1

print(f"# $TITLE")
print()
print(f"**Image:** {artifact}")
print(f"**Scan date:** {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
print()
print("## Summary")
print()
print("| Severity | Count |")
print("|----------|-------|")
for sev in ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']:
    print(f"| {sev} | {counts[sev]} |")
print()

# List high and critical with fixes
fixable = [v for v in all_vulns if v.get('FixedVersion') and v.get('Severity') in ('CRITICAL', 'HIGH')]
if fixable:
    print("## Critical/High with fixes available")
    print()
    print("| CVE | Package | Severity | Installed | Fixed |")
    print("|-----|---------|----------|-----------|-------|")
    for v in sorted(fixable, key=lambda x: x.get('Severity', '')):
        print(f"| {v.get('VulnerabilityID', '-')} | {v.get('PkgName', '-')} | {v.get('Severity', '-')} | {v.get('InstalledVersion', '-')} | {v.get('FixedVersion', '-')} |")
    print()

# All medium
medium_fixable = [v for v in all_vulns if v.get('FixedVersion') and v.get('Severity') == 'MEDIUM']
if medium_fixable:
    print("## Medium with fixes available")
    print()
    print("| CVE | Package | Installed | Fixed |")
    print("|-----|---------|-----------|-------|")
    for v in medium_fixable:
        print(f"| {v.get('VulnerabilityID', '-')} | {v.get('PkgName', '-')} | {v.get('InstalledVersion', '-')} | {v.get('FixedVersion', '-')} |")
    print()
PYEOF
