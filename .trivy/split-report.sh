#!/bin/bash
# Split trivy report into main (DevPortal base) and plugins (dynamic plugins) reports
# Dynamic plugins are in /app/dynamic-plugins-root/ and maintained by upstream

set -euo pipefail

INPUT="$1"

if [[ ! -f "$INPUT" ]]; then
    echo "Error: Input file '$INPUT' not found" >&2
    exit 1
fi

OUTDIR="$(dirname "$INPUT")"

# Main report: everything NOT in dynamic-plugins-root
jq '{
    SchemaVersion: .SchemaVersion,
    ArtifactName: .ArtifactName,
    ArtifactType: .ArtifactType,
    Metadata: .Metadata,
    Results: [
        .Results[]? | 
        select(.Target | test("dynamic-plugins-root") | not)
    ]
}' "$INPUT" > "$OUTDIR/main-report.json"

# Plugins report: only dynamic-plugins-root
jq '{
    SchemaVersion: .SchemaVersion,
    ArtifactName: .ArtifactName,
    ArtifactType: .ArtifactType,
    Metadata: .Metadata,
    Results: [
        .Results[]? | 
        select(.Target | test("dynamic-plugins-root"))
    ]
}' "$INPUT" > "$OUTDIR/plugins-report.json"

echo "Split complete:"
echo "  Main report: $OUTDIR/main-report.json"
echo "  Plugins report: $OUTDIR/plugins-report.json"
