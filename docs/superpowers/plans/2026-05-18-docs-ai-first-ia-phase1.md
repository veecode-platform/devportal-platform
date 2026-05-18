# Docs AI-first IA Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Phase 1 foundation of the AI-first concept-first docs IA — wayfinding tooling, generator + linter, the 7 golden-path topic files, the 4 day-1 reference files, and a CI gate that keeps them in sync.

**Architecture:** Atomic markdown files with YAML frontmatter under `docs/topics/`, `docs/how-to/`, `docs/reference/`. A Python linter validates frontmatter; a Python generator emits `/llms.txt` and replaces marker-delimited index sections in `docs/README.md`. Both scripts run on every PR to prevent drift.

**Tech Stack:** Python 3.12 (already in repo for TechDocs), `pyyaml` (already a transitive dep via mkdocs), no new dependencies. CI via existing `pr-check.yml`.

**Source spec:** [`docs/superpowers/specs/2026-05-18-docs-concept-first-ia-design.md`](../specs/2026-05-18-docs-concept-first-ia-design.md)

---

## File map

### New files

| Path | Purpose | Lines (approx) |
|---|---|---|
| `scripts/lint-docs-frontmatter.py` | Validate frontmatter on every file under topics/how-to/reference | ~120 |
| `scripts/test_lint_docs_frontmatter.py` | Tests for the linter (pytest) | ~120 |
| `scripts/build-docs-index.py` | Generate `/llms.txt` and `docs/README.md` index sections | ~150 |
| `scripts/test_build_docs_index.py` | Tests for the generator (pytest) | ~120 |
| `scripts/fixtures/docs/topics/valid-topic.md` | Test fixture | ~10 |
| `scripts/fixtures/docs/topics/another-topic.md` | Test fixture (for cross-link validation) | ~10 |
| `scripts/fixtures/docs/topics/missing-name.md` | Test fixture (invalid) | ~5 |
| `scripts/fixtures/docs/topics/mismatched-name.md` | Test fixture (invalid) | ~5 |
| `scripts/fixtures/docs/topics/bad-related.md` | Test fixture (invalid) | ~10 |
| `scripts/fixtures/docs/adr/001-fixture.md` | ADR test fixture | ~5 |
| `llms.txt` | Auto-generated machine-readable docs index (repo root) | ~50 |
| `docs/README.md` | New entry-point (replaces PROJECT_CONTEXT.md as front door) | ~100 |
| `docs/topics/installing.md` | First-run install path | ~200 |
| `docs/topics/presets.md` | What presets are, how to compose | ~300 |
| `docs/topics/dynamic-plugins.md` | OCI loading, install-dynamic-plugins.py, default.yaml | ~300 |
| `docs/topics/configuration-layering.md` | The --config precedence chain | ~250 |
| `docs/topics/theming.md` | VeeCode theme + customer brand swap | ~250 |
| `docs/topics/plugin-authoring.md` | Author flow (Backstage plugin → ready for packaging) | ~300 |
| `docs/topics/plugin-packaging.md` | OCI bundle via export-overlays, referencing in default.yaml | ~250 |
| `docs/reference/env-vars.md` | Every env var the image consumes, source-cited | ~150 |
| `docs/reference/preset-schema.md` | Full preset YAML format | ~150 |
| `docs/reference/shipped-presets.md` | Table of the 12 current presets + var contracts | ~120 |
| `docs/reference/glossary.md` | Backstage terms with one-line definitions + upstream links | ~100 |

### Modified files

| Path | Change |
|---|---|
| `.github/workflows/pr-check.yml` | Add a `docs-check` job: runs the linter and the generator in `--check` mode |
| `docs/PROJECT_CONTEXT.md` | Mark deprecated; add banner pointing to new `docs/README.md` (content fully absorbed in Phase 2) |

### Untouched in Phase 1

- All current `docs/*.md` other than `PROJECT_CONTEXT.md` — stay in place until Phase 2 absorbs their content
- All `docs/adr/*.md`
- `docs/UPGRADING_FROM_BASE_DISTRO.md`, `docs/MUI_MIGRATION_STATUS.md`, `docs/ROADMAP_*.md`

---

## Task 1: Create directory skeleton

**Files:**
- Create: `docs/topics/.gitkeep`
- Create: `docs/how-to/.gitkeep`
- Create: `docs/reference/.gitkeep`
- Create: `scripts/fixtures/docs/topics/.gitkeep`
- Create: `scripts/fixtures/docs/how-to/.gitkeep`
- Create: `scripts/fixtures/docs/reference/.gitkeep`
- Create: `scripts/fixtures/docs/adr/.gitkeep`

- [ ] **Step 1: Create the directories and placeholder files**

```bash
mkdir -p docs/topics docs/how-to docs/reference \
         scripts/fixtures/docs/{topics,how-to,reference,adr}
touch docs/topics/.gitkeep docs/how-to/.gitkeep docs/reference/.gitkeep \
      scripts/fixtures/docs/topics/.gitkeep scripts/fixtures/docs/how-to/.gitkeep \
      scripts/fixtures/docs/reference/.gitkeep scripts/fixtures/docs/adr/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add docs/topics docs/how-to docs/reference scripts/fixtures
git commit -m "docs: scaffold topics/how-to/reference directories"
```

---

## Task 2: Add Python testing setup

**Files:**
- Modify: `python/requirements.txt` (add pytest)

- [ ] **Step 1: Check current requirements**

Run: `cat python/requirements.txt`
Expected: shows mkdocs + transitive deps; verify pyyaml is present (it is — pulled in by mkdocs).

- [ ] **Step 2: Append pytest as a doc-tooling dep**

Open `python/requirements.txt` and add at the end (separated by a comment):

```
# Doc-tooling tests
pytest>=8.0
```

- [ ] **Step 3: Verify install**

Run:

```bash
source venv/bin/activate 2>/dev/null || python3 -m venv venv && source venv/bin/activate
pip install -r python/requirements.txt
pytest --version
```

Expected: pytest >= 8.0 prints.

- [ ] **Step 4: Commit**

```bash
git add python/requirements.txt
git commit -m "docs(tooling): add pytest for doc-tooling scripts"
```

---

## Task 3: Build the frontmatter linter (TDD)

**Files:**
- Create: `scripts/lint-docs-frontmatter.py`
- Create: `scripts/test_lint_docs_frontmatter.py`
- Create: `scripts/fixtures/docs/topics/valid-topic.md`
- Create: `scripts/fixtures/docs/topics/another-topic.md`
- Create: `scripts/fixtures/docs/topics/missing-name.md`
- Create: `scripts/fixtures/docs/topics/mismatched-name.md`
- Create: `scripts/fixtures/docs/topics/bad-related.md`

- [ ] **Step 1: Write fixture files**

Create `scripts/fixtures/docs/topics/valid-topic.md`:

```markdown
---
name: valid-topic
description: A perfectly valid topic for linter testing.
type: topic
audience: [operator]
related: [another-topic]
---

# Valid topic body.
```

Create `scripts/fixtures/docs/topics/another-topic.md`:

```markdown
---
name: another-topic
description: Another valid topic, referenced by valid-topic.
type: topic
audience: [plugin-author]
---

# Another topic body.
```

Create `scripts/fixtures/docs/topics/missing-name.md`:

```markdown
---
description: Missing the required name field.
type: topic
audience: [operator]
---

# Body.
```

Create `scripts/fixtures/docs/topics/mismatched-name.md`:

```markdown
---
name: this-doesnt-match-the-filename
description: Name field does not match filename stem.
type: topic
audience: [operator]
---

# Body.
```

Create `scripts/fixtures/docs/topics/bad-related.md`:

```markdown
---
name: bad-related
description: Has a related slug that does not resolve.
type: topic
audience: [operator]
related: [does-not-exist]
---

# Body.
```

- [ ] **Step 2: Write the linter tests first**

Create `scripts/test_lint_docs_frontmatter.py`:

```python
"""Tests for lint-docs-frontmatter.py."""
from pathlib import Path
import importlib.util
import sys

FIXTURES = Path(__file__).parent / "fixtures" / "docs"

# Import the linter as a module (the script has a hyphenated name)
spec = importlib.util.spec_from_file_location(
    "linter", Path(__file__).parent / "lint-docs-frontmatter.py"
)
linter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(linter)


def fixture_paths(*names):
    return [FIXTURES / "topics" / n for n in names]


def test_valid_file_produces_no_errors():
    paths = fixture_paths("valid-topic.md", "another-topic.md")
    errors = linter.validate(paths)
    assert errors == [], f"unexpected errors: {errors}"


def test_missing_required_field_is_reported():
    paths = fixture_paths("missing-name.md", "another-topic.md")
    errors = linter.validate(paths)
    assert any("missing required fields" in e and "name" in e for e in errors), errors


def test_mismatched_name_is_reported():
    paths = fixture_paths("mismatched-name.md")
    errors = linter.validate(paths)
    assert any("does not match filename" in e for e in errors), errors


def test_bad_related_slug_is_reported():
    paths = fixture_paths("bad-related.md", "another-topic.md")
    errors = linter.validate(paths)
    assert any("related" in e and "does not resolve" in e for e in errors), errors


def test_duplicate_slug_is_reported(tmp_path):
    # Create two files claiming the same slug
    (tmp_path / "a.md").write_text(
        "---\nname: dup\ndescription: x\ntype: topic\naudience: [operator]\n---\nbody\n"
    )
    (tmp_path / "b.md").write_text(
        "---\nname: dup\ndescription: x\ntype: topic\naudience: [operator]\n---\nbody\n"
    )
    # Name field is "dup" but filenames are "a" and "b" — also triggers mismatched-name;
    # filter to the duplicate-slug error
    errors = linter.validate(list(tmp_path.glob("*.md")))
    assert any("duplicate slug" in e for e in errors), errors


def test_invalid_type_value_is_reported():
    # Build a fixture inline
    path = FIXTURES / "topics" / "valid-topic.md"
    text = path.read_text().replace("type: topic", "type: blog-post")
    tmp = path.parent / "tmp-invalid-type.md"
    tmp.write_text(text.replace("name: valid-topic", "name: tmp-invalid-type"))
    try:
        errors = linter.validate([tmp])
        assert any("type" in e and "blog-post" in e for e in errors), errors
    finally:
        tmp.unlink()


def test_invalid_audience_value_is_reported():
    path = FIXTURES / "topics" / "valid-topic.md"
    text = path.read_text().replace("audience: [operator]", "audience: [marketer]")
    tmp = path.parent / "tmp-invalid-audience.md"
    tmp.write_text(text.replace("name: valid-topic", "name: tmp-invalid-audience"))
    try:
        errors = linter.validate([tmp])
        assert any("audience" in e and "marketer" in e for e in errors), errors
    finally:
        tmp.unlink()
```

- [ ] **Step 3: Run tests to verify they fail (linter doesn't exist yet)**

Run: `pytest scripts/test_lint_docs_frontmatter.py -v`
Expected: ERROR — "No module named 'linter'" or "cannot import" (the linter file doesn't exist).

- [ ] **Step 4: Implement the linter**

Create `scripts/lint-docs-frontmatter.py`:

```python
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
    Raises ValueError on malformed YAML; returns (None, text) when no frontmatter block.
    """
    text = path.read_text()
    m = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
    if not m:
        return None, text
    try:
        return yaml.safe_load(m.group(1)), m.group(2)
    except yaml.YAMLError as e:
        raise ValueError(f"{path}: invalid YAML frontmatter: {e}")


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
        if not isinstance(fm, dict):
            errors.append(f"{path}: frontmatter must be a YAML mapping")
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest scripts/test_lint_docs_frontmatter.py -v`
Expected: all 7 tests pass.

- [ ] **Step 6: Run the linter against the empty real docs/ (sanity check)**

Run: `python scripts/lint-docs-frontmatter.py`
Expected: `OK — validated 0 file(s).` (the real `docs/topics/`, `how-to/`, `reference/` are empty except for `.gitkeep`).

- [ ] **Step 7: Commit**

```bash
git add scripts/lint-docs-frontmatter.py scripts/test_lint_docs_frontmatter.py \
        scripts/fixtures/docs/topics/*.md
git commit -m "docs(tooling): frontmatter linter + fixtures + tests"
```

---

## Task 4: Build the index generator (TDD)

**Files:**
- Create: `scripts/build-docs-index.py`
- Create: `scripts/test_build_docs_index.py`
- Create: `scripts/fixtures/docs/adr/001-fixture.md`

- [ ] **Step 1: Add the ADR fixture**

Create `scripts/fixtures/docs/adr/001-fixture.md`:

```markdown
# ADR-001: Fixture ADR

## Status

Accepted

## Context

This is a fixture for generator tests.
```

- [ ] **Step 2: Write the generator tests**

Create `scripts/test_build_docs_index.py`:

```python
"""Tests for build-docs-index.py."""
from pathlib import Path
import importlib.util

FIXTURES = Path(__file__).parent / "fixtures" / "docs"

spec = importlib.util.spec_from_file_location(
    "gen", Path(__file__).parent / "build-docs-index.py"
)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


def test_collect_topic_entries_parses_frontmatter(monkeypatch):
    monkeypatch.setattr(gen, "DOCS_ROOT", FIXTURES)
    monkeypatch.setattr(gen, "REPO_ROOT", FIXTURES.parent)
    entries = gen.collect_entries("topics")
    slugs = [e[0] for e in entries]
    assert "valid-topic" in slugs
    assert "another-topic" in slugs


def test_collect_adrs_extracts_title_from_h1(monkeypatch):
    monkeypatch.setattr(gen, "DOCS_ROOT", FIXTURES)
    monkeypatch.setattr(gen, "REPO_ROOT", FIXTURES.parent)
    adrs = gen.collect_adrs()
    titles = [a[0] for a in adrs]
    assert "ADR-001: Fixture ADR" in titles


def test_format_section_renders_as_markdown_list():
    entries = [("foo", "foo desc", "docs/topics/foo.md")]
    out = gen.format_section("Topics", entries)
    assert "## Topics" in out
    assert "- [foo](docs/topics/foo.md): foo desc" in out


def test_update_readme_replaces_marker_section(tmp_path):
    readme = tmp_path / "README.md"
    readme.write_text(
        "# Title\n\nIntro.\n\n"
        "<!-- BEGIN topic-index -->\nOLD\n<!-- END topic-index -->\n\nFooter.\n"
    )
    gen.update_readme(readme, {"topic-index": "## Topics\n\n- [x](y): z\n"})
    out = readme.read_text()
    assert "OLD" not in out
    assert "- [x](y): z" in out
    assert "<!-- BEGIN topic-index -->" in out
    assert "<!-- END topic-index -->" in out
    assert "Footer." in out


def test_update_readme_warns_on_missing_marker(tmp_path, capsys):
    readme = tmp_path / "README.md"
    readme.write_text("# Title\n\nNo markers.\n")
    gen.update_readme(readme, {"topic-index": "## Topics\n"})
    out = capsys.readouterr()
    assert "marker topic-index not found" in out.err


def test_build_llms_txt_contains_all_sections(monkeypatch):
    monkeypatch.setattr(gen, "DOCS_ROOT", FIXTURES)
    monkeypatch.setattr(gen, "REPO_ROOT", FIXTURES.parent)
    out = gen.build_llms_txt()
    assert "# devportal-platform" in out
    assert "## Topics" in out
    assert "## ADRs" in out
    assert "valid-topic" in out
    assert "ADR-001: Fixture ADR" in out
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest scripts/test_build_docs_index.py -v`
Expected: ERROR — generator file doesn't exist yet.

- [ ] **Step 4: Implement the generator**

Create `scripts/build-docs-index.py`:

```python
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
    m = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest scripts/test_build_docs_index.py -v`
Expected: all 6 tests pass.

- [ ] **Step 6: Run the generator (will create /llms.txt with empty sections — that's expected pre-content)**

Run: `python scripts/build-docs-index.py`
Expected: prints `Generated llms.txt …`; `llms.txt` now exists at repo root with `_(none yet)_` placeholders.

- [ ] **Step 7: Verify --check mode passes (we just regenerated)**

Run: `python scripts/build-docs-index.py --check`
Expected: `OK — indexes are in sync.` (exit 0).

- [ ] **Step 8: Verify --check mode catches drift**

Run:

```bash
echo "drift" >> llms.txt
python scripts/build-docs-index.py --check; echo "exit $?"
```

Expected: `llms.txt is stale; …` (exit 1).

Then restore:

```bash
python scripts/build-docs-index.py
```

- [ ] **Step 9: Commit**

```bash
git add scripts/build-docs-index.py scripts/test_build_docs_index.py \
        scripts/fixtures/docs/adr/001-fixture.md llms.txt
git commit -m "docs(tooling): index generator (llms.txt + README sections) + tests"
```

---

## Task 5: Add docs-check job to pr-check.yml

**Files:**
- Modify: `.github/workflows/pr-check.yml` — add a `docs-check` job

- [ ] **Step 1: Read the current workflow**

Run: `cat .github/workflows/pr-check.yml`

Note the existing job names and trigger conditions — you'll add `docs-check` as a sibling job, same trigger.

- [ ] **Step 2: Append the docs-check job**

Add at the end of the `jobs:` mapping in `.github/workflows/pr-check.yml`:

```yaml
  docs-check:
    name: Docs frontmatter + index check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install doc-tooling deps
        run: pip install pyyaml pytest

      - name: Run linter unit tests
        run: pytest scripts/test_lint_docs_frontmatter.py scripts/test_build_docs_index.py -v

      - name: Run frontmatter linter against docs/
        run: python scripts/lint-docs-frontmatter.py

      - name: Verify indexes are in sync
        run: python scripts/build-docs-index.py --check
```

- [ ] **Step 3: Lint the yaml locally**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/pr-check.yml'))"`
Expected: no output (valid yaml).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pr-check.yml
git commit -m "ci(docs): add docs-check job (linter + index drift check)"
```

---

## Task 6: Author `docs/reference/glossary.md`

**Files:**
- Create: `docs/reference/glossary.md`

The glossary is the smallest content file and unblocks `related:` references in the topic files (which often link to glossary terms).

- [ ] **Step 1: Draft the file**

Create `docs/reference/glossary.md`:

```markdown
---
name: glossary
description: Backstage terms used throughout these docs, one-line definitions with upstream links.
type: reference
audience: [operator, plugin-author, contributor]
---

# Glossary

> Upstream Backstage concepts referenced throughout the devportal-platform docs. Each entry is one or two sentences with a link to the canonical upstream docs.

## Catalog

The Backstage feature that ingests software entities (Components, Systems, APIs, Resources, Groups, Users) from `catalog-info.yaml` files and other providers. Upstream: <https://backstage.io/docs/features/software-catalog/>.

## Catalog provider

A backend module that discovers and ingests entities from a source (GitHub repos, GitLab groups, LDAP, Keycloak, etc.) into the catalog. Upstream: <https://backstage.io/docs/features/software-catalog/external-integrations>.

## Dynamic plugin

A plugin loaded at runtime from a path under `/app/dynamic-plugins-root/` rather than compiled into the backend bundle. See [`topics/dynamic-plugins.md`](../topics/dynamic-plugins.md).

## Entity

A unit of metadata in the catalog (a service, a library, a user, a group, etc.). Defined by `kind`, `metadata`, `spec`. Upstream: <https://backstage.io/docs/features/software-catalog/descriptor-format>.

## Mount point

A named extension slot in the Backstage frontend where a dynamic plugin can register a component (e.g. `entity.page.ci/cards`, `global.header/component`). Upstream / RHDH: <https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/frontend-plugin-wiring.md>.

## OCI bundle

An OCI image whose layers carry one or more pre-built dynamic plugins; pulled by `install-dynamic-plugins.py` at boot using `skopeo`. See [`topics/dynamic-plugins.md`](../topics/dynamic-plugins.md) and [`topics/plugin-packaging.md`](../topics/plugin-packaging.md).

## Preset

A versioned YAML contract selected at runtime via `VEECODE_PRESETS` that names which plugins to enable, which env vars are required, and which `app-config` to layer in. See [`topics/presets.md`](../topics/presets.md).

## Preset tier

Core (always on, no preset gating), `recommended` (chrome plugins that work with zero config), and integration presets (everything that needs customer-specific config). See [`topics/presets.md`](../topics/presets.md) § Tiers.

## Scaffolder

The Backstage feature that runs software templates to create new repos / projects / catalog entities. Upstream: <https://backstage.io/docs/features/software-templates/>.

## Scalprum

The Module Federation runtime (RHDH-derived) that loads dynamic frontend plugins into the running Backstage app at runtime. See [`packages/app/src/components/DynamicRoot/`](../../packages/app/src/components/DynamicRoot/).

## Scaffolder action

A unit of work a software template can execute (e.g. `publish:github`, `fetch:template`). Plugins can register their own. Upstream: <https://backstage.io/docs/features/software-templates/builtin-actions>.

## Static plugin

A plugin compiled into the backend bundle via `backend.add(import('@backstage/plugin-…'))` rather than loaded dynamically. The auth providers, catalog, scaffolder, RBAC, and TechDocs core ship static.

## TechDocs

Backstage's docs-as-code system — MkDocs-built sites rendered from a `catalog-info.yaml`-registered docs source. Upstream: <https://backstage.io/docs/features/techdocs/>.
```

- [ ] **Step 2: Run linter**

Run: `python scripts/lint-docs-frontmatter.py`
Expected: `OK — validated 1 file(s).`

- [ ] **Step 3: Regenerate indexes**

Run: `python scripts/build-docs-index.py`

- [ ] **Step 4: Commit**

```bash
git add docs/reference/glossary.md llms.txt
git commit -m "docs(reference): add glossary of upstream Backstage terms"
```

---

## Task 7: Author `docs/reference/env-vars.md`

**Files:**
- Create: `docs/reference/env-vars.md`

**Sources to cite (open and read before drafting):**
- `entrypoint.sh` — the canonical list of consumed env vars
- `scripts/dev-run.sh` lines ~118–125 — the env-var prefix regex (lists VEECODE_*, BACKSTAGE_VERSION, AUTH_*, GITHUB_*, GITLAB_*, AZURE_*, KEYCLOAK_*, LDAP_*, KONG_*, SONAR*, JENKINS_*, K8S_*, MCP_CHAT_*, PLUGIN_REGISTRY)
- `presets/*.yaml` — each preset's `requires.variables` block

- [ ] **Step 1: Read the sources**

Run:

```bash
grep -nE "^[A-Z_]+=|\\\${[A-Z_]+}" entrypoint.sh | head -50
ls presets/ | head -20
```

- [ ] **Step 2: Draft the file**

Create `docs/reference/env-vars.md` with this frontmatter and structure:

```markdown
---
name: env-vars
description: Every environment variable the devportal-platform image consumes at boot, grouped by purpose.
type: reference
audience: [operator]
related: [presets, configuration-layering]
---

# Environment variables

> Every env var the image reads at startup. Grouped by purpose. Each row cites the source file so you can verify the behavior against current code.

## Platform-wide

| Variable | Source | Purpose | Default |
|---|---|---|---|
| `VEECODE_PRESETS` | `entrypoint.sh:98` | Comma-separated list of presets to apply | unset (boots barebones) |
| `VEECODE_APP_CONFIG` | `entrypoint.sh:168` | Base64-encoded `app-config.yaml` overlay (decodes into `/app/app-config.saas.yaml`) | unset |
| `VEECODE_DOMAIN` | `entrypoint.sh:245` | Informational only; logged at startup | unset |
| `BACKSTAGE_VERSION` | `entrypoint.sh:214` | Substituted into plugin OCI tag refs | read from `backstage.json` |
| `PLUGIN_REGISTRY` | `entrypoint.sh:230` | Substituted into plugin OCI registry prefix | `quay.io/veecode` |
| `CATALOG_INDEX_IMAGE` | `entrypoint.sh:46` | OCI image carrying the marketplace catalog index | `quay.io/veecode/plugin-catalog-index:latest` |
| `CATALOG_INDEX_REFRESH` | `entrypoint.sh:49` | Force a re-download of the catalog index on boot | `false` |
| `LOG_LEVEL` | upstream Backstage | Log verbosity | `info` |
| `DEBUG_PORT` | `entrypoint.sh:290` | If set, enables Node `--inspect=0.0.0.0:$DEBUG_PORT` | unset |
| `DEVELOPMENT` | `entrypoint.sh:297` | If `true`, runs under nodemon with config watching | `false` |
| `NODE_OPTIONS` | runtime | Forwarded to Node; image default `--no-node-snapshot` | image-set |

## Theme / branding (legacy chart)

| Variable | Source | Purpose |
|---|---|---|
| `THEME_DOWNLOAD_URL` | `entrypoint.sh:17` | Download URL for a `theme.json` overlay |
| `THEME_CUSTOM_JSON` | `entrypoint.sh:20` | Inline `theme.json` content (overrides `THEME_DOWNLOAD_URL`) |
| `THEME_MERGE_JSON` | `entrypoint.sh:21` | If `false`, replace rather than merge `theme.json` |
| `THEME_FAV_ICON` | `entrypoint.sh:38` | Favicon download URL |
| `PLATFORM_DEVPORTAL_THEME_URL` | `entrypoint.sh:6` | Legacy chart equivalent of `THEME_DOWNLOAD_URL` |
| `PLATFORM_DEVPORTAL_FAVICON` | `entrypoint.sh:11` | Legacy chart equivalent of `THEME_FAV_ICON` |

## Per-preset variables

Each integration preset declares its required env vars in
`requires.variables`. See [`shipped-presets.md`](shipped-presets.md) for
the full per-preset list, or
[`presets/<preset-name>.yaml`](../../presets) for the authoritative
contract.

Examples (subset):

| Preset | Variables |
|---|---|
| `github` | `GITHUB_PAT`, `GITHUB_ORG` |
| `keycloak` | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `AUTH_SESSION_SECRET` |
| `azure` | `AZURE_DEVOPS_TOKEN`, `AZURE_DEVOPS_HOST`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT` |
| `mcp-chat` | `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`, `MCP_CHAT_MODEL` |

Missing a required var fails the boot with exit 78 and a
preset-aware error.
```

- [ ] **Step 3: Verify line numbers cited in the table are correct**

Run: `grep -nE "VEECODE_PRESETS|VEECODE_APP_CONFIG|BACKSTAGE_VERSION|PLUGIN_REGISTRY|CATALOG_INDEX_IMAGE|CATALOG_INDEX_REFRESH|DEBUG_PORT|DEVELOPMENT|THEME_|VEECODE_DOMAIN" entrypoint.sh`

Adjust the line numbers in the table to match the actual current values.

- [ ] **Step 4: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

Expected: lint OK, generator writes updated llms.txt.

- [ ] **Step 5: Commit**

```bash
git add docs/reference/env-vars.md llms.txt
git commit -m "docs(reference): document env vars consumed by the image"
```

---

## Task 8: Author `docs/reference/shipped-presets.md`

**Files:**
- Create: `docs/reference/shipped-presets.md`

**Sources to cite:**
- `presets/*.yaml` (all 12)
- `presets/README.md` § "Available presets" (table is the starting shape)

- [ ] **Step 1: List the actual current presets**

Run: `ls presets/*.yaml`

- [ ] **Step 2: Draft the file**

Create `docs/reference/shipped-presets.md`:

```markdown
---
name: shipped-presets
description: All presets shipped in the image, with their required variables and what they enable.
type: reference
audience: [operator]
related: [presets, env-vars]
---

# Shipped presets

> Every preset in `presets/` at the current image tag. Each row is the operator's contract: what enabling the preset gives you and what env vars you must provide.

| Preset | What it enables | Required env vars |
|---|---|---|
| [`recommended`](../../presets/recommended.yaml) | Marketplace (front + back), pending-changes, tech-radar (sample data), RBAC UI | none |
| [`veecode-theme`](../../presets/veecode-theme.yaml) | VeeCode brand palette + typography + MUI component overrides | none |
| [`github`](../../presets/github.yaml) | GitHub PAT integration + repo discovery + Actions UI tab. Does NOT wire OAuth sign-in | `GITHUB_PAT`, `GITHUB_ORG` |
| [`gitlab`](../../presets/gitlab.yaml) | GitLab OAuth sign-in + integration + repo/org catalog discovery | `GITLAB_HOST`, `GITLAB_AUTH_CLIENT_ID`, `GITLAB_AUTH_CLIENT_SECRET`, `GITLAB_TOKEN`, `GITLAB_GROUP` |
| [`azure`](../../presets/azure.yaml) | Azure DevOps integration + catalog + pipelines / PR UI. Does NOT wire Microsoft sign-in | `AZURE_DEVOPS_TOKEN`, `AZURE_DEVOPS_HOST`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT` |
| [`keycloak`](../../presets/keycloak.yaml) | Keycloak / OIDC sign-in + keycloakOrg user/group sync | `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `AUTH_SESSION_SECRET` |
| [`ldap`](../../presets/ldap.yaml) | LDAP sign-in + ldapOrg user/group sync (OpenLDAP defaults) | `LDAP_URL`, `LDAP_DN`, `LDAP_SECRET`, `LDAP_USERS_BASE_DN`, `LDAP_GROUPS_BASE_DN` |
| [`jenkins`](../../presets/jenkins.yaml) | Jenkins CI tab on entity pages | `JENKINS_URL`, `JENKINS_USERNAME`, `JENKINS_TOKEN` |
| [`kubernetes`](../../presets/kubernetes.yaml) | Kubernetes workloads tab on entity pages | `K8S_CLUSTER_NAME`, `K8S_CLUSTER_URL`, `K8S_CLUSTER_TOKEN` |
| [`sonarqube`](../../presets/sonarqube.yaml) | SonarQube code-quality tab + scaffolder action | `SONARQUBE_BASE_URL`, `SONARQUBE_API_KEY` |
| [`mcp`](../../presets/mcp.yaml) | MCP server at `/api/mcp-actions/v1` for external AI clients (Claude Code, Codex CLI, Cursor) via OAuth/DCR | none |
| [`mcp-chat`](../../presets/mcp-chat.yaml) | AI chat UI at `/mcp-chat`. **Compose with `mcp`** (loopback dependency) | `MCP_CHAT_PROVIDER`, `MCP_CHAT_API_KEY`, `MCP_CHAT_MODEL` |

## Composition

Presets compose. `VEECODE_PRESETS=recommended,veecode-theme,github,sonarqube` enables the
baseline + VeeCode look + GitHub stack + SonarQube. Required variables are unioned across
the selected presets; the boot exits 78 listing every missing one.

## Adding a custom preset

See [`topics/preset-authoring.md`](../topics/preset-authoring.md) (Phase 2). Until that ships, follow [`presets/README.md`](../../presets/README.md) § "Adding a new preset" and the [`presets/SCHEMA.md`](../../presets/SCHEMA.md) reference.
```

- [ ] **Step 3: Verify the preset list matches `ls presets/`**

If any preset has been added or removed since this plan was written, update the table.

- [ ] **Step 4: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 5: Commit**

```bash
git add docs/reference/shipped-presets.md llms.txt
git commit -m "docs(reference): table of shipped presets + required vars"
```

---

## Task 9: Author `docs/reference/preset-schema.md`

**Files:**
- Create: `docs/reference/preset-schema.md`

**Sources to cite (lift from):**
- `presets/SCHEMA.md` (current authoritative schema doc; this new file replaces it in the new IA, but content is largely the same)

- [ ] **Step 1: Read the current schema doc**

Run: `cat presets/SCHEMA.md`

- [ ] **Step 2: Lift content into the new location, adding frontmatter**

Create `docs/reference/preset-schema.md` by copying `presets/SCHEMA.md`'s content and prepending:

```yaml
---
name: preset-schema
description: Complete YAML schema for preset files, including frontmatter, requires, plugins, appConfig, and composition rules.
type: reference
audience: [operator, plugin-author]
related: [presets, shipped-presets]
---
```

Keep `presets/SCHEMA.md` in place for now — it gets retired in Phase 2 once all crosslinks are migrated.

- [ ] **Step 3: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 4: Commit**

```bash
git add docs/reference/preset-schema.md llms.txt
git commit -m "docs(reference): preset YAML schema reference (migrates presets/SCHEMA.md content)"
```

---

## Task 10: Author `docs/topics/installing.md`

**Files:**
- Create: `docs/topics/installing.md`

**Sources to cite:**
- `README.md` § "Quick start"
- `entrypoint.sh` (config precedence)
- `presets/README.md` (preset selection)

- [ ] **Step 1: Draft the file**

Create `docs/topics/installing.md` with frontmatter:

```yaml
---
name: installing
description: Get from "I want to try this" to a running devportal-platform with a preset enabled in under 30 minutes.
type: topic
audience: [operator]
related: [presets, configuration-layering, env-vars]
---
```

Body must cover, in order:

1. **What this is** — single paragraph: docker run with `VEECODE_PRESETS=…` and required env vars; image name and a representative tag.
2. **Prerequisites** — Docker, optional Python for TechDocs.
3. **The simplest possible run** — `docker run` with no presets (boots barebones).
4. **Adding the recommended preset + VeeCode theme** — runnable docker run with `-e VEECODE_PRESETS=recommended,veecode-theme`.
5. **Adding an integration** — runnable docker run with `-e VEECODE_PRESETS=recommended,veecode-theme,github -e GITHUB_PAT=… -e GITHUB_ORG=…`.
6. **What to expect at boot** — log lines that prove the preset resolver ran, the OCI plugins downloaded, healthcheck became 200. Reference `/api/dynamic-plugins-info/loaded-plugins`.
7. **Common boot failures** — exit 78 (missing required var), exit 137 (OOM during plugin install), `Could not resolve plugin` (registry unreachable / mirror needed).
8. **Common operations** — restarting to pick up an env change, mounting a custom `app-config.local.yaml`, mounting `dynamic-plugins-root` for inspection.
9. **Related topics** — `[presets]`, `[configuration-layering]`, `[env-vars]`.

Keep under 400 lines. Cite line numbers from `entrypoint.sh` for boot behavior.

- [ ] **Step 2: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 3: Commit**

```bash
git add docs/topics/installing.md llms.txt
git commit -m "docs(topics): installing — first-30-minutes path"
```

---

## Task 11: Author `docs/topics/presets.md`

**Files:**
- Create: `docs/topics/presets.md`

**Sources:**
- `presets/README.md` — primary source; lift the tiering + curation boundary content
- `docs/adr/010-unified-image-and-presets.md` § "Preset tiers and the curation boundary" — same content from architectural angle
- `presets/SCHEMA.md` — reference link only (depth lives in the reference file)

- [ ] **Step 1: Draft the file**

Create `docs/topics/presets.md` with frontmatter:

```yaml
---
name: presets
description: Composable YAML contracts selected at runtime (VEECODE_PRESETS) that turn the generic image into a working IDP for a specific stack.
type: topic
audience: [operator, plugin-author]
related: [dynamic-plugins, configuration-layering, preset-schema, shipped-presets]
---
```

Body must cover:

1. **What this is** — two paragraphs: the preset model, the two paths of use (preset path vs raw Backstage path).
2. **Tiers** — Core / `recommended` / integration presets, with admission tests for each. Source: lift from `presets/README.md` § Tiers, condense.
3. **How composition works at runtime** — `VEECODE_PRESETS=a,b,c`, what `entrypoint.sh` does (validate vars, write fragments, append to `--config` chain), reference `entrypoint.sh:83-160`.
4. **The curation boundary** — `requires.variables` as the boundary; no business logic; `recommended` is polished with zero config and does nothing real without it. Source: lift from `presets/README.md`.
5. **Picking presets for your situation** — examples (`recommended,veecode-theme,github`; `recommended,keycloak`; `mcp` for AI clients).
6. **Going further** — link to `[shipped-presets]` for the full table, `[preset-schema]` for the YAML format, `[plugin-packaging]` for authoring your own.
7. **Related topics**.

Cap 300 lines.

- [ ] **Step 2: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 3: Commit**

```bash
git add docs/topics/presets.md llms.txt
git commit -m "docs(topics): presets — tiers, composition, curation boundary"
```

---

## Task 12: Author `docs/topics/dynamic-plugins.md`

**Files:**
- Create: `docs/topics/dynamic-plugins.md`

**Sources:**
- `docs/DYNAMIC_PLUGINS_ARCHITECTURE.md` (current source; will be retired in Phase 2 — lift content)
- `docs/PLUGINS.md` § "Dynamic plugins — OCI"
- `dynamic-plugins.default.yaml` (the actual inventory)
- `docker/install-dynamic-plugins.py` (the install path)
- `entrypoint.sh` § preset resolver + shadow file + var substitution

- [ ] **Step 1: Draft the file**

Create `docs/topics/dynamic-plugins.md` with frontmatter:

```yaml
---
name: dynamic-plugins
description: How dynamic plugins are referenced, pulled from OCI, installed, and merged into the running app at boot.
type: topic
audience: [operator, plugin-author]
related: [presets, plugin-authoring, plugin-packaging, configuration-layering]
---
```

Body covers:

1. **What this is** — what counts as dynamic vs static; the OCI bundle + install-script model.
2. **The plugin inventory** — `dynamic-plugins.default.yaml` is the canonical list; entries default to `disabled: true`; presets flip `disabled: false`.
3. **Reference shape** — `oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>` (cite `entrypoint.sh` lines that substitute `PLUGIN_REGISTRY` and `BACKSTAGE_VERSION`); the bare-name fallback for `preInstalled` chrome plugins.
4. **Boot sequence** — `entrypoint.sh` preset resolver writes fragments → shadow `dynamic-plugins.default.resolved.yaml` (cite shadow-file block) → `install-dynamic-plugins.py` pulls bundles via skopeo → `pluginConfig` merges into `/app/dynamic-plugins-root/app-config.dynamic-plugins.yaml`.
5. **Where loaded plugins live at runtime** — `/app/dynamic-plugins-root/<name>/`; how to inspect via `/api/dynamic-plugins-info/loaded-plugins`.
6. **Common failure modes** — `Could not resolve plugin` (registry mirror unreachable, see `[env-vars]` for `PLUGIN_REGISTRY`); preset/default `package:` string mismatch (causes duplicate-registration crash); shadow file foot-gun (when default is bind-mounted read-only).
7. **Mirror / loaded-variant alternatives** — same content as ADR-010 § Distribution modes, condensed; how to set `PLUGIN_REGISTRY=…`; how to build a "loaded variant" image `FROM veecode/devportal-platform:<tag>`.
8. **Related topics**.

Cap 300 lines.

- [ ] **Step 2: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 3: Commit**

```bash
git add docs/topics/dynamic-plugins.md llms.txt
git commit -m "docs(topics): dynamic-plugins — OCI loading + install pipeline"
```

---

## Task 13: Author `docs/topics/configuration-layering.md`

**Files:**
- Create: `docs/topics/configuration-layering.md`

**Sources:**
- `docs/CONFIGURATION_GUIDE.md` (current source)
- `entrypoint.sh` § Config file precedence comment block (lines ~257–289)

- [ ] **Step 1: Draft the file**

Create `docs/topics/configuration-layering.md` with frontmatter:

```yaml
---
name: configuration-layering
description: How app-config.*.yaml files merge at boot, including preset configs, mounted overrides, and the SaaS path.
type: topic
audience: [operator]
related: [presets, env-vars]
---
```

Body covers:

1. **What this is** — Backstage's native `--config` deep merge + the platform's chain.
2. **The precedence chain** — table copied verbatim from `entrypoint.sh:257-267` comment block (cite the lines):
   - `app-config.yaml` → `app-config.production.yaml` → `app-config.distro.yaml` → `app-config.preset-<name>.yaml` → `app-config.local.yaml` → `dynamic-plugins-root/app-config.dynamic-plugins.yaml` → `app-config.saas.yaml`
3. **Var substitution** — `${VAR}` and `${VAR:-default}` syntax; resolution at boot vs at template time.
4. **The two operator paths** — preset path vs raw Backstage path; cross-link `[presets]`.
5. **The `VEECODE_APP_CONFIG` base64 env** — when to use it (chart-managed deployments); how it decodes into `/app/app-config.saas.yaml`.
6. **Common operations** — mount your own `app-config.local.yaml`; override a single preset value (point at `app-config.local.yaml`); inspect the resolved chain at boot (`docker logs … | grep EXTRA_ARGS`).
7. **Related topics**.

Cap 250 lines.

- [ ] **Step 2: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 3: Commit**

```bash
git add docs/topics/configuration-layering.md llms.txt
git commit -m "docs(topics): configuration-layering — the --config chain"
```

---

## Task 14: Author `docs/topics/theming.md`

**Files:**
- Create: `docs/topics/theming.md`

**Sources:**
- `docs/adr/011-frontend-design-system.md` — the architectural rationale; lift the "theme as own preset" framing
- `presets/veecode-theme.yaml`
- `dynamic-plugins.default.yaml` § VeeCode theme entry
- `packages/app/src/components/DynamicRoot/Loader.tsx` — comment about how the theme is discovered

- [ ] **Step 1: Draft the file**

Create `docs/topics/theming.md` with frontmatter:

```yaml
---
name: theming
description: How the VeeCode theme is delivered as a dynamic plugin, and how to ship a customer brand the same way.
type: topic
audience: [operator, plugin-author]
related: [presets, dynamic-plugins, plugin-packaging]
---
```

Body covers:

1. **What this is** — theme delivered as dynamic plugin, gated by its own preset (`veecode-theme`).
2. **Why a preset and not baked in** — `recommended` deliberately omits the theme; customer brand swap = drop our preset, add theirs. Cite ADR-011 § Tiering.
3. **What the `veecode-theme` preset actually does** — sets `app.branding` + enables the theme dynamic plugin. Reference `dynamic-plugins.default.yaml` for the OCI entry, `Loader.tsx` for the discovery path.
4. **Customizing the theme as a customer** — copy `presets/veecode-theme.yaml` to `presets/<company>-theme.yaml`; point the OCI ref at your bundle; use `VEECODE_PRESETS=recommended,<company>-theme`.
5. **Authoring a new theme plugin** — high-level walk-through; defer build details to `[plugin-packaging]`; key gotchas from ADR-011 § "Lições críticas" (`rhdh-cli plugin export`, `sideEffects: ["**/*.css"]`, React/MUI peer-deps, theme id collision).
6. **The minimum-VeeCode-identity fallback** — even without `veecode-theme`, the always-on Core `veecode-global-header` plugin renders the VeeCode header; reference ADR-011.
7. **Related topics**.

Cap 250 lines.

- [ ] **Step 2: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 3: Commit**

```bash
git add docs/topics/theming.md llms.txt
git commit -m "docs(topics): theming — VeeCode theme as own preset + customer brand swap"
```

---

## Task 15: Author `docs/topics/plugin-authoring.md`

**Files:**
- Create: `docs/topics/plugin-authoring.md`

**Sources:**
- `docs/adr/011-frontend-design-system.md` § "Lições críticas" — the authoring gotchas
- `devportal-plugin-export-overlays` README (cross-repo) — for build/publish flow (link out, don't duplicate)
- `docs/PLUGINS.md` — current authoring-adjacent content

- [ ] **Step 1: Draft the file**

Create `docs/topics/plugin-authoring.md` with frontmatter:

```yaml
---
name: plugin-authoring
description: Author flow for a new dynamic plugin — the Backstage plugin code, the dynamic export, the conventions that keep it loadable.
type: topic
audience: [plugin-author]
related: [dynamic-plugins, plugin-packaging, theming, presets]
---
```

Body covers:

1. **What this is** — scope: the *Backstage plugin code* side (your TypeScript). The OCI packaging side lives in `[plugin-packaging]`.
2. **Decide: frontend or backend (or both)** — what they do; how each is loaded; mount points (frontend) vs `backend.add(import(...))` registrations (backend, but for dynamic, see RHDH contract).
3. **The build tool** — use `rhdh-cli plugin export`, NOT `janus-cli` (cite ADR-011 § Lições críticas, condense the reasoning).
4. **Mandatory `package.json` settings** — `sideEffects: ["**/*.css"]` so CSS survives webpack tree-shaking; `react` + `react-dom` in `peerDependencies` (NOT dependencies); zero `@mui/material` in dependencies. Cite ADR-011.
5. **Plugin entry points** — what to export; the `dist-scalprum/` artifact shape; the manifest.
6. **Mount points** — where the plugin's UI surfaces in the running app; reference `dynamic-plugins.default.yaml` for mount-point examples.
7. **Local dev loop** — link to `scripts/dev-run.sh` for the image-overlay path; how to iterate on a plugin against the running container.
8. **What's next** — link to `[plugin-packaging]` for OCI build + publish.
9. **Related topics**.

Cap 300 lines. When in doubt, cross-link to ADR-011 rather than duplicate.

- [ ] **Step 2: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 3: Commit**

```bash
git add docs/topics/plugin-authoring.md llms.txt
git commit -m "docs(topics): plugin-authoring — Backstage plugin code + dynamic export"
```

---

## Task 16: Author `docs/topics/plugin-packaging.md`

**Files:**
- Create: `docs/topics/plugin-packaging.md`

**Sources:**
- `devportal-plugin-export-overlays` README (cross-repo) — the build pipeline lives there
- `entrypoint.sh` § `PLUGIN_REGISTRY` + `BACKSTAGE_VERSION` substitution
- `dynamic-plugins.default.yaml` (entry shape examples)

- [ ] **Step 1: Draft the file**

Create `docs/topics/plugin-packaging.md` with frontmatter:

```yaml
---
name: plugin-packaging
description: Package an authored plugin as an OCI bundle, publish it, and reference it from devportal-platform.
type: topic
audience: [plugin-author, operator]
related: [plugin-authoring, dynamic-plugins, presets]
---
```

Body covers:

1. **What this is** — scope: take a plugin built per `[plugin-authoring]`, package as OCI, get it loaded into a running platform image.
2. **Where the build pipeline lives** — `veecode-platform/devportal-plugin-export-overlays`. Link out; do not duplicate its README.
3. **Tag scheme** — `bs_<backstage-version>` for the OCI tag; `<workspace>:bs_<X>!<selector>` for the full ref. Cite the actual shipped pattern from `dynamic-plugins.default.yaml`.
4. **Referencing the plugin from `devportal-platform`** — add an entry to `dynamic-plugins.default.yaml`:
   ```yaml
   - package: oci://${PLUGIN_REGISTRY}/<your-workspace>:bs_${BACKSTAGE_VERSION}!<your-selector>
     disabled: true
     pluginConfig:
       dynamicPlugins:
         frontend:    # or backend
           <plugin-id>:
             # mountPoints, dynamicRoutes, menuItems, etc.
   ```
5. **Enabling it via a preset** — add to `presets/<name>.yaml`'s `plugins:` block with `disabled: false`; the `package:` string MUST match the default exactly. Cite `presets/README.md` § Composition rules.
6. **Registry mirroring** — operators with internal registries set `PLUGIN_REGISTRY=registry.internal/<org>`; explain the substitution at `entrypoint.sh`.
7. **Loaded-variant alternative** — for air-gapped deployments, build `FROM veecode/devportal-platform:<tag>` and pre-extract into `/app/dynamic-plugins-root/`. Cite ADR-010 § Distribution modes.
8. **Related topics**.

Cap 250 lines.

- [ ] **Step 2: Run linter and regenerate**

```bash
python scripts/lint-docs-frontmatter.py
python scripts/build-docs-index.py
```

- [ ] **Step 3: Commit**

```bash
git add docs/topics/plugin-packaging.md llms.txt
git commit -m "docs(topics): plugin-packaging — OCI bundle + reference from platform"
```

---

## Task 17: Author `docs/README.md` with marker-delimited index sections

**Files:**
- Create: `docs/README.md`

**Sources:**
- `docs/PROJECT_CONTEXT.md` — content basis for the "What this is" + "Two paths of use" sections
- `~/.claude/skills/veecode/SKILL.md` if accessible — shape reference for "Where to start by task" section

- [ ] **Step 1: Draft the file**

Create `docs/README.md`:

```markdown
# devportal-platform — docs

> Open-source Backstage distribution shipped as one unified container image. Operators select presets at runtime (`VEECODE_PRESETS`) to turn the generic image into a working IDP for their specific stack.

## What this is

One image (`docker.io/veecode/devportal-platform`), one Dockerfile, one CI, one release. The plugin set is data — referenced as `oci://` bundles in `dynamic-plugins.default.yaml`, pulled at boot. To turn the generic image into a working IDP for your stack, an operator selects **presets** at runtime via `VEECODE_PRESETS`.

See [ADR-010](adr/010-unified-image-and-presets.md) for the architectural decision behind this shape.

## Two paths of use

1. **Preset path (the shortcut)** — `VEECODE_PRESETS=recommended,veecode-theme,github` plus the env vars the preset requires.
2. **Raw Backstage path (the escape hatch)** — leave `VEECODE_PRESETS` unset, mount your own `app-config.yaml` + `dynamic-plugins.yaml`.

Both compose naturally — operator overrides via `app-config.local.yaml` always win. See [`topics/configuration-layering.md`](topics/configuration-layering.md).

## Where to start by task

- **Running it for the first time** → [`topics/installing.md`](topics/installing.md) → [`topics/presets.md`](topics/presets.md) → [`topics/configuration-layering.md`](topics/configuration-layering.md)
- **Modifying which plugins are active** → [`topics/dynamic-plugins.md`](topics/dynamic-plugins.md) → [`topics/presets.md`](topics/presets.md)
- **Wiring an integration (GitHub / Keycloak / Azure / …)** → [`topics/presets.md`](topics/presets.md) → [`reference/shipped-presets.md`](reference/shipped-presets.md)
- **Creating a new dynamic plugin** → [`topics/plugin-authoring.md`](topics/plugin-authoring.md) → [`topics/plugin-packaging.md`](topics/plugin-packaging.md)
- **Customizing the theme** → [`topics/theming.md`](topics/theming.md)
- **Migrating from `devportal-base` + `devportal-distro`** → [`UPGRADING_FROM_BASE_DISTRO.md`](UPGRADING_FROM_BASE_DISTRO.md)

> _Topic, how-to, reference, and ADR indexes below this line are auto-generated by `scripts/build-docs-index.py`. Do not hand-edit between the marker comments — your changes will be overwritten on the next push._

<!-- BEGIN topic-index -->

_(auto-generated)_

<!-- END topic-index -->

<!-- BEGIN how-to-index -->

_(auto-generated)_

<!-- END how-to-index -->

<!-- BEGIN reference-index -->

_(auto-generated)_

<!-- END reference-index -->

<!-- BEGIN adr-index -->

_(auto-generated)_

<!-- END adr-index -->
```

- [ ] **Step 2: Run the generator to populate the marker sections**

Run: `python scripts/build-docs-index.py`
Expected: prints success; the `<!-- BEGIN x -->` sections now contain real topic/reference/adr listings.

- [ ] **Step 3: Run linter to confirm no regressions**

Run: `python scripts/lint-docs-frontmatter.py`
Expected: `OK — validated 7 file(s).` (6 from Tasks 6–9 + the new README is not lint-scanned because it lives at `docs/README.md`, not under topics/how-to/reference).

- [ ] **Step 4: Run --check to confirm idempotency**

Run: `python scripts/build-docs-index.py --check`
Expected: `OK — indexes are in sync.`

- [ ] **Step 5: Commit**

```bash
git add docs/README.md llms.txt
git commit -m "docs: add docs/README.md entry point with auto-generated indexes"
```

---

## Task 18: Mark `docs/PROJECT_CONTEXT.md` as deprecated

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md` (banner at top)

- [ ] **Step 1: Read the current file**

Run: `head -10 docs/PROJECT_CONTEXT.md`

- [ ] **Step 2: Add deprecation banner**

Prepend at the very top of `docs/PROJECT_CONTEXT.md`, before any existing content:

```markdown
> ⚠️ **MOVED.** The content of this file is being absorbed into [`docs/README.md`](README.md) as part of the docs reorganization (see [`superpowers/specs/2026-05-18-docs-concept-first-ia-design.md`](superpowers/specs/2026-05-18-docs-concept-first-ia-design.md)). New material goes in `docs/README.md` and the `docs/topics/` tree. This file will be deleted in Phase 2.

```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT_CONTEXT.md
git commit -m "docs: mark PROJECT_CONTEXT.md deprecated (content moves to docs/README.md)"
```

---

## Task 19: Final verification

- [ ] **Step 1: Verify the linter passes on all real content**

Run: `python scripts/lint-docs-frontmatter.py`
Expected: `OK — validated 7 file(s).`

- [ ] **Step 2: Verify the generator is idempotent (no drift)**

Run: `python scripts/build-docs-index.py --check`
Expected: `OK — indexes are in sync.`

- [ ] **Step 3: Verify the unit tests still pass**

Run: `pytest scripts/ -v`
Expected: all 13 tests pass (7 linter + 6 generator).

- [ ] **Step 4: Spot-check the README rendering on GitHub**

Push the branch:

```bash
git push -u origin docs/concept-first-ia-spec
```

Open `https://github.com/veecode-platform/devportal-platform/blob/docs/concept-first-ia-spec/docs/README.md` in a browser. Confirm the marker comments don't render visibly, and the auto-generated lists look right.

- [ ] **Step 5: Spot-check `/llms.txt` contents**

Run: `cat llms.txt`

Confirm the file is < 2 KB and lists all 7 docs (1 topic from each of the 7 topic tasks + 4 reference + ADRs).

- [ ] **Step 6: Open the PR (if everything above checks out)**

Run:

```bash
gh pr create --title "docs: AI-first concept-first IA — Phase 1 (foundation + golden-path topics)" --body "$(cat <<'EOF'
## Summary

Phase 1 of the docs IA migration per [docs/superpowers/specs/2026-05-18-docs-concept-first-ia-design.md](docs/superpowers/specs/2026-05-18-docs-concept-first-ia-design.md). Lands:

- **Tooling:** `scripts/lint-docs-frontmatter.py` (validates frontmatter), `scripts/build-docs-index.py` (generates `/llms.txt` and replaces marker-delimited sections in `docs/README.md`), pytest coverage for both.
- **CI:** new `docs-check` job in `pr-check.yml` (runs the linter + verifies indexes are in sync).
- **Wayfinding:** new `docs/README.md` entry point; `/llms.txt` at repo root following the [llmstxt.org](https://llmstxt.org) convention.
- **Golden-path topics:** `installing`, `presets`, `dynamic-plugins`, `configuration-layering`, `theming`, `plugin-authoring`, `plugin-packaging` under `docs/topics/`.
- **Day-1 reference:** `env-vars`, `preset-schema`, `shipped-presets`, `glossary` under `docs/reference/`.
- **Deprecation banner** on `docs/PROJECT_CONTEXT.md` pointing to the new entry; full retirement of old top-level files happens in Phase 2.

## Test plan

- [ ] CI `docs-check` job passes (linter + generator `--check`).
- [ ] CI `validate` job passes.
- [ ] `pytest scripts/ -v` passes locally.
- [ ] `docs/README.md` renders cleanly on GitHub (marker comments don't show; auto-generated lists populate).
- [ ] `/llms.txt` is < 2 KB and lists all Phase 1 docs.
- [ ] Walk one golden path end-to-end: open `docs/README.md` → click "Running it for the first time" → install → presets → configuration-layering. Confirm the path makes sense to someone seeing it cold.
- [ ] Walk plugin-author path: open `docs/README.md` → click "Creating a new dynamic plugin" → plugin-authoring → plugin-packaging. Confirm a developer with no prior context can follow it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Optional: split into two PRs

The plan is written as one continuous flow but lands ~30 new files total
(15 user-facing docs + scripts + test fixtures). If reviewers prefer
smaller PRs, split naturally after **Task 5**:

- **PR A — Tooling + CI** (Tasks 1–5, ~13 files): directory skeleton,
  linter, generator, test fixtures, pytest setup, `docs-check` CI job.
  Lands the foundation; can be reviewed in isolation by anyone familiar
  with the test patterns.
- **PR B — Content + entry point** (Tasks 6–18, ~13 files): the 11
  content files, the new `docs/README.md`, the `PROJECT_CONTEXT.md`
  deprecation banner. Lands the user-facing docs; reviewer reads
  Markdown.

If you go with one PR, the executor runs Tasks 1–19 sequentially and
opens a single PR in Task 19. If you go with two PRs, push and open
PR A after Task 5, wait for merge, then continue with Tasks 6–18 on a
new branch off updated `main`, and run Task 19 against PR B only.

## Out of scope for this plan (covered by Phase 2)

- Authoring the remaining ~17 topic files
- Authoring the ~10 how-to recipes
- Authoring the remaining 3 reference files (`dynamic-plugin-schema.md`, `app-config-precedence.md`, `core-plugins.md`)
- Deleting the legacy top-level files (`CONFIGURATION_GUIDE.md`, `DEVELOPMENT_GUIDE.md`, etc.)
- Adding `related:` links from Phase 1 files to Phase 2 files (those links become valid as Phase 2 lands; until then the linter `related:` check would fail, so Phase 1 files only `related:` to other Phase 1 files or to themselves' ADRs)

## Open questions left in the spec

- **`/llms.txt` location** — root vs `docs/llms.txt`. Plan uses root per llmstxt.org. Easy to change in Task 4 if the call goes the other way.
- **Linter implementation language** — plan uses Python (already in repo for TechDocs). If a future spec swaps in Node, replace Tasks 2–4 wholesale.
- **`docs-check` job placement** — plan adds as a sibling job inside `pr-check.yml`. Could be a separate `.github/workflows/docs-check.yml` if you prefer to isolate.
