#!/usr/bin/env python3
"""Derive the backend pluginIds the HOST registers statically.

The package name does not determine the pluginId: it is declared inside each
package's createBackendPlugin/createBackendModule call, so
@backstage/plugin-app-backend registers "app" and
@backstage/plugin-kubernetes-backend registers "kubernetes". The only reliable
source is the built package itself.

Reads `backend.add(import('X'))` out of packages/backend/src/index.ts, then for
each X resolves node_modules/X and extracts pluginId from its dist bundle,
distinguishing createBackendPlugin (registers a pluginId, can collide) from
createBackendModule (extends one, cannot collide).
"""
import json
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
INDEX = os.path.join(ROOT, 'packages/backend/src/index.ts')
NM = os.path.join(ROOT, 'node_modules')

with open(INDEX) as f:
    src = f.read()

# Strip line comments so a commented-out backend.add() is not counted.
src_nocomment = re.sub(r'^\s*//.*$', '', src, flags=re.MULTILINE)
pkgs = re.findall(r"backend\.add\(\s*import\(\s*['\"]([^'\"]+)['\"]", src_nocomment)

print(f"backend.add(import(...)) entries: {len(pkgs)}", file=sys.stderr)

plugins = {}   # pluginId -> [packages that register it]
modules = []   # packages that only extend
unknown = []

for pkg in sorted(set(pkgs)):
    pkg_dir = os.path.join(NM, pkg)
    if not os.path.isdir(pkg_dir):
        unknown.append((pkg, 'not in node_modules'))
        continue
    dist = os.path.join(pkg_dir, 'dist')
    blob = ''
    # Walk RECURSIVELY: @backstage/plugin-catalog-backend puts the
    # createBackendPlugin call in dist/service/CatalogPlugin.cjs.js, not at the
    # top of dist/. Reading only the top level silently missed `catalog` and
    # `app` — and a MISSING static id is the dangerous direction here, because
    # the gate would then wave through a real collision.
    if os.path.isdir(dist):
        for dirpath, _dirnames, filenames in os.walk(dist):
            for fn in sorted(filenames):
                if fn.endswith(('.cjs.js', '.esm.js')) and not fn.endswith('.map'):
                    try:
                        with open(os.path.join(dirpath, fn), errors='ignore') as f:
                            blob += f.read()
                    except OSError:
                        pass
    if not blob:
        unknown.append((pkg, 'no readable dist'))
        continue

    # createBackendPlugin({ pluginId: "x" }) -> registers x
    # createBackendModule({ pluginId: "x", moduleId: "y" }) -> extends x
    plugin_ids = set(re.findall(
        r'createBackendPlugin\(\s*\{[^}]{0,400}?pluginId:\s*["\']([^"\']+)["\']', blob, re.S))
    module_ids = set(re.findall(
        r'createBackendModule\(\s*\{[^}]{0,400}?pluginId:\s*["\']([^"\']+)["\']', blob, re.S))

    if plugin_ids:
        for pid in sorted(plugin_ids):
            plugins.setdefault(pid, []).append(pkg)
    elif module_ids:
        modules.append((pkg, sorted(module_ids)))
    else:
        unknown.append((pkg, 'no pluginId found in dist'))

print("\n=== REGISTERS a pluginId (can collide with a dynamic backend-plugin) ===", file=sys.stderr)
for pid in sorted(plugins):
    print(f"  {pid:28s} <- {', '.join(plugins[pid])}", file=sys.stderr)

print("\n=== only EXTENDS (createBackendModule — cannot collide) ===", file=sys.stderr)
for pkg, ids in modules:
    print(f"  {pkg:62s} -> {', '.join(ids)}", file=sys.stderr)

print("\n=== UNRESOLVED ===", file=sys.stderr)
for pkg, why in unknown:
    print(f"  {pkg:62s} ({why})", file=sys.stderr)

dupes = {p: v for p, v in plugins.items() if len(v) > 1}
if dupes:
    print(f"\n!! two static packages register the same pluginId: {dupes}", file=sys.stderr)

json.dump(
    {
        'comment': 'Backend pluginIds this image registers STATICALLY. Generated; see test.',
        'staticBackendPluginIds': sorted(plugins),
    },
    sys.stdout,
    indent=2,
)
print(file=sys.stdout)
