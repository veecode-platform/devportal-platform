#!/bin/bash
# Split trivy report into main-report and plugins-report
# main-report: everything NOT under dynamic-plugins-root/
# plugins-report: everything under dynamic-plugins-root/

INPUT="$1"
if [ -z "$INPUT" ]; then
  echo "Usage: $0 <report.json>"
  exit 1
fi

OUTDIR=$(dirname "$INPUT")

# main report: targets NOT in dynamic-plugins-root
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [.Results[]? | select(.Target | test("dynamic-plugins-root") | not)]
}' "$INPUT" > "$OUTDIR/main-report.json"

# plugins report: targets in dynamic-plugins-root
jq '{
  SchemaVersion: .SchemaVersion,
  ArtifactName: .ArtifactName,
  ArtifactType: .ArtifactType,
  Metadata: .Metadata,
  Results: [.Results[]? | select(.Target | test("dynamic-plugins-root"))]
}' "$INPUT" > "$OUTDIR/plugins-report.json"

echo "Split complete: main-report.json and plugins-report.json"
