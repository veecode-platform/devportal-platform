#!/usr/bin/env python3
"""Generate /llms.txt and docs/README.md index sections from frontmatter.

Usage:
  scripts/build-docs-index.py            # regenerate llms.txt and README sections in place
  scripts/build-docs-index.py --check    # exit 1 if regen would change anything
"""
import re
import sys
from pathlib import Path
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS_ROOT = REPO_ROOT / "docs"

# Lifted verbatim from spec § "Wayfinding"; if you change this text, also update the spec.
LLMS_HEADER = """# devportal-platform

> Open-source Backstage distribution shipped as one unified container image. Operators select presets at runtime (VEECODE_PRESETS) to turn the generic image into a working IDP.
"""


def parse_frontmatter(path: Path):
    text = path.read_text()
    m = re.match(r"^---\r?\n(.*?)(\r?\n)?---\r?\n?(.*)", text, re.DOTALL)
    if not m:
        return None
    return yaml.safe_load(m.group(1))


def parse_adr_title(path: Path):
    """ADRs have no frontmatter — pull the title from the first H1."""
    for line in path.read_text().splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem


def collect_entries(dir_name: str):
    """Returns list of (slug, description, relpath) sorted by slug. Skips files with no frontmatter."""
    out = []
    for p in sorted((DOCS_ROOT / dir_name).rglob("*.md")):
        fm = parse_frontmatter(p)
        if fm is None or not isinstance(fm, dict) or "name" not in fm:
            continue
        slug = fm["name"]
        desc = fm.get("description", "")
        relpath = p.relative_to(REPO_ROOT)
        out.append((slug, desc, str(relpath)))
    return out


def collect_adrs():
    out = []
    for p in sorted((DOCS_ROOT / "adr").rglob("*.md")):
        title = parse_adr_title(p)
        relpath = p.relative_to(REPO_ROOT)
        out.append((title, str(relpath)))
    return out


def format_section(title: str, entries):
    if not entries:
        return f"## {title}\n\n_(none yet)_\n"
    lines = [f"## {title}", ""]
    for slug, desc, relpath in entries:
        lines.append(f"- [{slug}]({relpath}): {desc}")
    return "\n".join(lines) + "\n"


def format_adr_section(adrs):
    if not adrs:
        return "## ADRs\n\n_(none)_\n"
    lines = ["## ADRs", ""]
    for title, relpath in adrs:
        lines.append(f"- [{title}]({relpath})")
    return "\n".join(lines) + "\n"


def build_llms_txt():
    return "\n".join([
        LLMS_HEADER,
        format_section("Topics", collect_entries("topics")),
        format_section("How-to", collect_entries("how-to")),
        format_section("Reference", collect_entries("reference")),
        format_adr_section(collect_adrs()),
    ])


def build_readme_index_sections():
    return {
        "topic-index": format_section("Topic index", collect_entries("topics")),
        "how-to-index": format_section("How-to recipes", collect_entries("how-to")),
        "reference-index": format_section("Reference", collect_entries("reference")),
        "adr-index": format_adr_section(collect_adrs()),
    }


def update_readme(readme_path: Path, sections: dict):
    """Replace content between <!-- BEGIN {marker} --> / <!-- END {marker} --> for each section."""
    text = readme_path.read_text()
    for marker, content in sections.items():
        pattern = re.compile(
            rf"<!-- BEGIN {marker} -->.*?<!-- END {marker} -->",
            re.DOTALL,
        )
        replacement = f"<!-- BEGIN {marker} -->\n\n{content}\n<!-- END {marker} -->"
        if not pattern.search(text):
            print(f"WARN: marker {marker} not found in {readme_path}", file=sys.stderr)
            continue
        text = pattern.sub(replacement, text)
    readme_path.write_text(text)


def main():
    check = "--check" in sys.argv

    llms_path = REPO_ROOT / "llms.txt"
    readme_path = DOCS_ROOT / "README.md"

    new_llms = build_llms_txt()

    if check:
        existing = llms_path.read_text() if llms_path.exists() else ""
        if existing != new_llms:
            print(
                f"llms.txt is stale; run scripts/build-docs-index.py to regenerate",
                file=sys.stderr,
            )
            sys.exit(1)
        if readme_path.exists():
            existing_readme = readme_path.read_text()
            sections = build_readme_index_sections()
            candidate = existing_readme
            for marker, content in sections.items():
                pattern = re.compile(
                    rf"<!-- BEGIN {marker} -->.*?<!-- END {marker} -->",
                    re.DOTALL,
                )
                if pattern.search(candidate):
                    candidate = pattern.sub(
                        f"<!-- BEGIN {marker} -->\n\n{content}\n<!-- END {marker} -->",
                        candidate,
                    )
            if candidate != existing_readme:
                print(
                    f"docs/README.md index sections are stale; run scripts/build-docs-index.py to regenerate",
                    file=sys.stderr,
                )
                sys.exit(1)
        print("OK — indexes are in sync.")
        return

    llms_path.write_text(new_llms)
    if readme_path.exists():
        update_readme(readme_path, build_readme_index_sections())
    print(f"Generated {llms_path.relative_to(REPO_ROOT)} and (if present) {readme_path.relative_to(REPO_ROOT)} index sections.")


if __name__ == "__main__":
    main()
