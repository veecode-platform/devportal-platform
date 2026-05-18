"""Tests for build-docs-index.py."""
import sys
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
    original = "# Title\n\nNo markers.\n"
    readme.write_text(original)
    gen.update_readme(readme, {"topic-index": "## Topics\n"})
    out = capsys.readouterr()
    assert "marker topic-index not found" in out.err
    assert readme.read_text() == original


def test_build_llms_txt_contains_all_sections(monkeypatch):
    monkeypatch.setattr(gen, "DOCS_ROOT", FIXTURES)
    monkeypatch.setattr(gen, "REPO_ROOT", FIXTURES.parent)
    out = gen.build_llms_txt()
    assert "# devportal-platform" in out
    assert "## Topics" in out
    assert "## ADRs" in out
    assert "valid-topic" in out
    assert "ADR-001: Fixture ADR" in out


def test_check_mode_passes_when_in_sync(monkeypatch, tmp_path, capsys):
    """When llms.txt matches build_llms_txt() output, --check exits 0."""
    # REPO_ROOT must be parent of DOCS_ROOT so relative_to() works on fixture paths.
    repo_root = FIXTURES.parent
    monkeypatch.setattr(gen, "DOCS_ROOT", FIXTURES)
    monkeypatch.setattr(gen, "REPO_ROOT", repo_root)
    llms_path = repo_root / "llms.txt"
    original = llms_path.read_text() if llms_path.exists() else None
    try:
        llms_path.write_text(gen.build_llms_txt())
        monkeypatch.setattr(sys, "argv", ["build-docs-index.py", "--check"])
        gen.main()  # should not raise
        out = capsys.readouterr()
        assert "in sync" in out.out
    finally:
        if original is None:
            llms_path.unlink(missing_ok=True)
        else:
            llms_path.write_text(original)


def test_check_mode_fails_when_llms_txt_stale(monkeypatch, tmp_path):
    """When llms.txt does not match generator output, --check exits 1."""
    # REPO_ROOT must be parent of DOCS_ROOT so relative_to() works on fixture paths.
    repo_root = FIXTURES.parent
    monkeypatch.setattr(gen, "DOCS_ROOT", FIXTURES)
    monkeypatch.setattr(gen, "REPO_ROOT", repo_root)
    llms_path = repo_root / "llms.txt"
    original = llms_path.read_text() if llms_path.exists() else None
    try:
        llms_path.write_text("stale content\n")
        monkeypatch.setattr(sys, "argv", ["build-docs-index.py", "--check"])
        import pytest
        with pytest.raises(SystemExit) as exc_info:
            gen.main()
        assert exc_info.value.code == 1
    finally:
        if original is None:
            llms_path.unlink(missing_ok=True)
        else:
            llms_path.write_text(original)


def test_check_mode_fails_when_readme_missing_marker(monkeypatch, tmp_path):
    """When docs/README.md is missing a marker block, --check exits 1."""
    docs = tmp_path / "docs"
    docs.mkdir()
    monkeypatch.setattr(gen, "DOCS_ROOT", docs)
    monkeypatch.setattr(gen, "REPO_ROOT", tmp_path)
    # Set up: docs sub-dirs so collect_entries() doesn't crash
    for d in ("topics", "how-to", "reference", "adr"):
        (docs / d).mkdir()
    (docs / "README.md").write_text("# Title\n\nNo markers here.\n")
    # llms.txt must match what the generator produces for this DOCS_ROOT
    (tmp_path / "llms.txt").write_text(gen.build_llms_txt())
    monkeypatch.setattr(sys, "argv", ["build-docs-index.py", "--check"])
    import pytest
    with pytest.raises(SystemExit) as exc_info:
        gen.main()
    assert exc_info.value.code == 1
