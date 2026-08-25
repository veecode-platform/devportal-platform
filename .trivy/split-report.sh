#!/usr/bin/env bash
# Split a Trivy JSON report into main DevPortal and dynamic-plugins sections.
# Dynamic plugins live under paths containing "dynamic-plugins-root".
#
# Usage: split-report.sh <report.json>
# Creates: main-report.json and plugins-report.json alongside the input file.

set -euo pipefail

INPUT="${1:?Usage: split-report.sh <report.json>}"
DIR="$(dirname "$INPUT")"

jq '
  . as $root |
  ($root | .Results |= map(select(.Target | test("dynamic-plugins-root") | not))) as $main |
  ($root | .Results |= map(select(.Target | test("dynamic-plugins-root")))) as $plugins |
  {main: $main, plugins: $plugins}
' "$INPUT" | jq -r '.main' > "$DIR/main-report.json"

jq '
  . as $root |
  ($root | .Results |= map(select(.Target | test("dynamic-plugins-root")))) as $plugins |
  $plugins
' "$INPUT" > "$DIR/plugins-report.json"

echo "Split complete:"
echo "  $DIR/main-report.json"
echo "  $DIR/plugins-report.json"
