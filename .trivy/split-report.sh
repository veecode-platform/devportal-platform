#!/usr/bin/env bash
set -euo pipefail
REPORT="$1"
DIR="$(dirname "$REPORT")"

# Main report: exclude dynamic-plugins-root paths
jq '[.Results[] | select(.Target | contains("dynamic-plugins-root") | not) | {Target, Class, Type, Vulnerabilities: (.Vulnerabilities // [])}] | {SchemaVersion: 2, ArtifactName: "devportal-base", Results: .}' "$REPORT" > "$DIR/main-report.json"

# Plugins report: only dynamic-plugins-root paths
jq '[.Results[] | select(.Target | contains("dynamic-plugins-root")) | {Target, Class, Type, Vulnerabilities: (.Vulnerabilities // [])}] | {SchemaVersion: 2, ArtifactName: "dynamic-plugins", Results: .}' "$REPORT" > "$DIR/plugins-report.json"
