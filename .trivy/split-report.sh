#!/usr/bin/env bash
# Split a Trivy JSON report into main-report.json and plugins-report.json.
# Dynamic plugins live under /app/dynamic-plugins-root/ inside the image;
# their vulnerabilities are maintained by upstream projects, not this repo.
set -euo pipefail

REPORT="${1:-.trivyscan/report.json}"
OUTDIR="$(dirname "$REPORT")"

if [ ! -f "$REPORT" ]; then
  echo "Error: report file not found: $REPORT" >&2
  exit 1
fi

# Main report: everything NOT under dynamic-plugins-root
python3 - "$REPORT" "$OUTDIR/main-report.json" "$OUTDIR/plugins-report.json" <<'PYEOF'
import sys, json

report_path = sys.argv[1]
main_path   = sys.argv[2]
plugins_path= sys.argv[3]

with open(report_path) as f:
    data = json.load(f)

main_results    = []
plugins_results = []

for result in data.get("Results", []):
    target = result.get("Target", "")
    if "dynamic-plugins-root" in target:
        plugins_results.append(result)
    else:
        main_results.append(result)

main_data    = dict(data, Results=main_results)
plugins_data = dict(data, Results=plugins_results)

with open(main_path, "w") as f:
    json.dump(main_data, f, indent=2)

with open(plugins_path, "w") as f:
    json.dump(plugins_data, f, indent=2)

print(f"Main results:    {len(main_results)} target(s)")
print(f"Plugins results: {len(plugins_results)} target(s)")
PYEOF
