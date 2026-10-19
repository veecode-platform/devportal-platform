#!/usr/bin/env bash
# Split a Trivy JSON report into main DevPortal and dynamic plugins reports.
# Usage: .trivy/split-report.sh <report.json>
set -euo pipefail

INPUT="${1:-}"
if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 <report.json>" >&2
  exit 1
fi

DIR="$(dirname "$INPUT")"

# Main report: everything NOT under dynamic-plugins-root/
python3 - "$INPUT" "$DIR/main-report.json" "$DIR/plugins-report.json" <<'EOF'
import json, sys

with open(sys.argv[1]) as f:
    report = json.load(f)

main_results = []
plugin_results = []

for result in report.get("Results", []):
    target = result.get("Target", "")
    if "dynamic-plugins-root" in target:
        plugin_results.append(result)
    else:
        main_results.append(result)

main_report = dict(report)
main_report["Results"] = main_results

plugin_report = dict(report)
plugin_report["Results"] = plugin_results

with open(sys.argv[2], "w") as f:
    json.dump(main_report, f, indent=2)

with open(sys.argv[3], "w") as f:
    json.dump(plugin_report, f, indent=2)

print(f"Main results: {len(main_results)} targets")
print(f"Plugin results: {len(plugin_results)} targets")
EOF
