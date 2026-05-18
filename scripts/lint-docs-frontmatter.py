#!/usr/bin/env python3
"""Validate frontmatter on docs/topics/, docs/how-to/, docs/reference/."""
import re
import sys
from pathlib import Path
import yaml

REQUIRED_FIELDS = {"name", "description", "type", "audience"}
VALID_TYPES = {"topic", "how-to", "reference"}
VALID_AUDIENCES = {"operator", "plugin-author", "contributor"}
REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_ROOT = REPO_ROOT / "docs"
SCAN_DIRS = ["topics", "how-to", "reference"]


def parse_frontmatter(path: Path):
    """Return (frontmatter dict, body)
    Raises ValueError on malformed YAML or non-mapping frontmatter.
    Returns (None, text) when no frontmatter block is present.
    """
    text = path.read_text()
    m = re.match(r"^---\r?\n(.*?)(\r?\n)?---\r?\n?(.*)", text, re.DOTALL)
    if not m:
        return None, text
    try:
        fm = yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        raise ValueError(f"{path}: invalid YAML frontmatter: {e}")
    if not isinstance(fm, dict):
        raise ValueError(f"{path}: frontmatter must be a YAML mapping")
    return fm, m.group(3)


def validate(paths):
    errors = []
    all_slugs = {}  # slug -> first path that claimed it

    parsed = []
    for path in paths:
        try:
            fm, _ = parse_frontmatter(path)
        except ValueError as e:
            errors.append(str(e))
            continue
        if fm is None:
            errors.append(f"{path}: missing frontmatter")
            continue
        parsed.append((path, fm))
        if "name" in fm:
            slug = fm["name"]
            if slug in all_slugs:
                errors.append(
                    f"{path}: duplicate slug {slug!r} (also in {all_slugs[slug]})"
                )
            else:
                all_slugs[slug] = path

    for path, fm in parsed:
        missing = REQUIRED_FIELDS - set(fm.keys())
        if missing:
            errors.append(
                f"{path}: missing required fields: {sorted(missing)}"
            )

        if "name" in fm:
            if fm["name"] != path.stem:
                errors.append(
                    f"{path}: name {fm['name']!r} does not match filename {path.stem!r}"
                )

        if "type" in fm and fm["type"] not in VALID_TYPES:
            errors.append(
                f"{path}: type {fm['type']!r} not in {sorted(VALID_TYPES)}"
            )

        if "audience" in fm:
            if not isinstance(fm["audience"], list):
                errors.append(f"{path}: audience must be a list")
            else:
                for a in fm["audience"]:
                    if a not in VALID_AUDIENCES:
                        errors.append(
                            f"{path}: audience {a!r} not in {sorted(VALID_AUDIENCES)}"
                        )

        if "related" in fm:
            if not isinstance(fm["related"], list):
                errors.append(f"{path}: related must be a list")
            else:
                for r in fm["related"]:
                    if r not in all_slugs:
                        errors.append(
                            f"{path}: related {r!r} does not resolve to any file"
                        )

    return errors


def main():
    paths = []
    for d in SCAN_DIRS:
        paths.extend(sorted((DOCS_ROOT / d).rglob("*.md")))
    errors = validate(paths)
    for e in errors:
        print(e, file=sys.stderr)
    if errors:
        print(f"\n{len(errors)} error(s) — see above.", file=sys.stderr)
        sys.exit(1)
    print(f"OK — validated {len(paths)} file(s).")


if __name__ == "__main__":
    main()
