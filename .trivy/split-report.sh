#!/usr/bin/env bash
# Split a Trivy JSON report into main DevPortal and dynamic-plugins reports.
# Usage: split-report.sh <report.json>
set -euo pipefail

REPORT="${1:-.trivyscan/report.json}"
MAIN_OUT="${2:-.trivyscan/main-report.json}"
PLUGINS_OUT="${3:-.trivyscan/plugins-report.json}"

# Dynamic plugins live under paths containing dynamic-plugins-root
jq '
  def is_plugin_target:
    .Target != null and (.Target | test("dynamic-plugins-root"; "i"));

  {
    SchemaVersion: .SchemaVersion,
    ArtifactName: .ArtifactName,
    ArtifactType: .ArtifactType,
    Metadata: .Metadata,
    Results: [.Results[]? | select(is_plugin_target | not)]
  }
' "$REPORT" > "$MAIN_OUT"

jq '
  def is_plugin_target:
    .Target != null and (.Target | test("dynamic-plugins-root"; "i"));

  {
    SchemaVersion: .SchemaVersion,
    ArtifactName: .ArtifactName,
    ArtifactType: .ArtifactType,
    Metadata: .Metadata,
    Results: [.Results[]? | select(is_plugin_target)]
  }
' "$REPORT" > "$PLUGINS_OUT"

echo "Split complete:"
echo "  Main:    $MAIN_OUT"
echo "  Plugins: $PLUGINS_OUT"
