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


def test_invalid_type_value_is_reported(tmp_path):
    p = tmp_path / "invalid-type.md"
    p.write_text(
        "---\nname: invalid-type\ndescription: x\ntype: blog-post\naudience: [operator]\n---\nbody\n"
    )
    errors = linter.validate([p])
    assert any("type" in e and "blog-post" in e for e in errors), errors


def test_invalid_audience_value_is_reported(tmp_path):
    p = tmp_path / "invalid-audience.md"
    p.write_text(
        "---\nname: invalid-audience\ndescription: x\ntype: topic\naudience: [marketer]\n---\nbody\n"
    )
    errors = linter.validate([p])
    assert any("audience" in e and "marketer" in e for e in errors), errors


def test_no_frontmatter_block_is_reported(tmp_path):
    p = tmp_path / "no-fm.md"
    p.write_text("# Just a heading\n\nNo frontmatter here.\n")
    errors = linter.validate([p])
    assert any("missing frontmatter" in e for e in errors), errors


def test_malformed_yaml_is_reported(tmp_path):
    p = tmp_path / "bad-yaml.md"
    p.write_text("---\nname: [unclosed\n---\nbody\n")
    errors = linter.validate([p])
    assert any("invalid YAML frontmatter" in e for e in errors), errors


def test_empty_frontmatter_is_reported(tmp_path):
    p = tmp_path / "empty-fm.md"
    p.write_text("---\n---\nbody\n")
    errors = linter.validate([p])
    # yaml.safe_load("") returns None, which is not a dict
    assert any("frontmatter must be a YAML mapping" in e for e in errors), errors


def test_file_without_trailing_newline_is_parsed(tmp_path):
    p = tmp_path / "no-trailing-nl.md"
    # Note: no \n after closing ---
    p.write_text("---\nname: no-trailing-nl\ndescription: x\ntype: topic\naudience: [operator]\n---")
    errors = linter.validate([p])
    # Should validate cleanly — no "missing frontmatter" misdiagnosis
    assert not any("missing frontmatter" in e for e in errors), errors
