#!/usr/bin/env python3
"""Render the Plugin/Package entities the bench catalog holds.

Reads a Backstage /api/catalog/entities response on stdin. Kept as a file rather
than inline in bench.sh because the f-strings need quotes that do not survive
shell escaping.

The relations are the point: they are DERIVED by the extensions catalog module
from Package.spec.partOf and Plugin.spec.packages, never declared. No module
loaded means no relations — and in fact the entities are rejected entirely.
"""
import json
import sys


def main() -> int:
    try:
        items = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("  could not parse the catalog response")
        return 1

    if not items:
        print("  none — the fixture did not ingest")
        print("  (expected when no catalog module is loaded: the Plugin/Package")
        print("   kinds have no processor, so the catalog rejects them)")
        return 0

    print(f"  total: {len(items)}")
    for entity in sorted(items, key=lambda e: (e["kind"], e["metadata"]["name"])):
        meta = entity["metadata"]
        namespace = meta.get("namespace", "default")
        artifact = (entity.get("spec") or {}).get("dynamicArtifact")
        relations = [
            r for r in (entity.get("relations") or [])
            if r["targetRef"].startswith(("package:", "plugin:"))
        ]

        print(f"  {entity['kind']:<8} {namespace}/{meta['name']}")
        if artifact:
            print(f"           artifact: {artifact}")
        for relation in relations:
            print(f"           relation: {relation['type']} -> {relation['targetRef']}")
        if not relations:
            print("           relation: (none — is the catalog module loaded?)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
