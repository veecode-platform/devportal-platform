#!/bin/bash
# Split trivy report into main (devportal) and plugins (dynamic-plugins-root) sections
set -e

INPUT="$1"
if [ -z "$INPUT" ]; then
    echo "Usage: split-report.sh <report.json>" >&2
    exit 1
fi

DIR=$(dirname "$INPUT")

# Main report: everything NOT in dynamic-plugins-root
jq '{SchemaVersion: .SchemaVersion, ArtifactName: .ArtifactName, ArtifactType: .ArtifactType, Metadata: .Metadata, Results: [.Results[]? | select(.Target | test("dynamic-plugins-root") | not)]}' "$INPUT" > "$DIR/main-report.json"

# Plugins report: everything IN dynamic-plugins-root
jq '{SchemaVersion: .SchemaVersion, ArtifactName: .ArtifactName, ArtifactType: .ArtifactType, Metadata: .Metadata, Results: [.Results[]? | select(.Target | test("dynamic-plugins-root"))]}' "$INPUT" > "$DIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json created"
