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
