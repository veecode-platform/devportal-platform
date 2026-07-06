#!/usr/bin/env bash
# Split a Trivy JSON report into main-report.json (DevPortal base) and
# plugins-report.json (dynamic plugins in dynamic-plugins-root/).
set -euo pipefail

INPUT="${1:-}"
if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 <report.json>" >&2
  exit 1
fi

OUTDIR="$(dirname "$INPUT")"

# main-report: everything NOT under dynamic-plugins-root
jq 'del(.Results[] | select(.Target | contains("dynamic-plugins-root")))' "$INPUT" \
  > "$OUTDIR/main-report.json"

# plugins-report: only dynamic-plugins-root entries
jq '.Results = [.Results[] | select(.Target | contains("dynamic-plugins-root"))]' "$INPUT" \
  > "$OUTDIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json written to $OUTDIR"
