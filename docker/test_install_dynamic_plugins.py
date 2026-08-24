"""Tests for install-dynamic-plugins.py — duplicate plugin detection, OCI ref
parsing (bare per-plugin refs, `{{inherit}}` resolution)."""
import base64
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch

import pytest

spec = importlib.util.spec_from_file_location(
    "idp", Path(__file__).parent / "install-dynamic-plugins.py"
)
idp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(idp)


# --- plugin_identity ---------------------------------------------------------

def test_identity_oci_ref_is_the_selector():
    assert idp.plugin_identity(
        "oci://reg/backstage:bs_1.49.4!backstage-plugin-kubernetes"
    ) == "backstage-plugin-kubernetes"


def test_identity_bare_oci_ref_is_the_repo_name():
    # One-image-per-plugin format (no `!selector`) — identity falls back to
    # the image's own repo name, the same fallback OciDownloader uses for
    # plugin_path, so it still collides correctly with a `!name` ref for the
    # same plugin under the old workspace-image format.
    assert idp.plugin_identity("oci://reg/backstage-plugin-kubernetes:bs_1.49.4") == "backstage-plugin-kubernetes"


def test_identity_oci_ref_without_tag_is_none():
    # No `:` at all after the registry/path — malformed, not just bare.
    assert idp.plugin_identity("oci://reg/backstage") is None


def test_identity_npm_ref_is_the_package_string():
    assert idp.plugin_identity(
        "veecode-platform-plugin-veecode-homepage-dynamic"
    ) == "veecode-platform-plugin-veecode-homepage-dynamic"


# --- check_plugin_identity_collisions ----------------------------------------

def _entry(disabled=False):
    return {"disabled": disabled}


def test_same_selector_different_tags_both_enabled_raises():
    plugins = {
        "oci://reg/x:tag_A!backstage-plugin-kubernetes": _entry(),
        "oci://reg/x:tag_B!backstage-plugin-kubernetes": _entry(),
    }
    with pytest.raises(idp.InstallException, match="backstage-plugin-kubernetes"):
        idp.check_plugin_identity_collisions(plugins)


def test_collision_ignored_when_one_entry_disabled():
    plugins = {
        "oci://reg/x:tag_A!backstage-plugin-kubernetes": _entry(),
        "oci://reg/x:tag_B!backstage-plugin-kubernetes": _entry(disabled=True),
    }
    idp.check_plugin_identity_collisions(plugins)  # no raise


def test_bare_refs_same_image_different_tags_both_enabled_raises():
    # Two bare (one-image-per-plugin) refs to the same image at different
    # tags are the bare-ref equivalent of test_same_selector_different_tags_
    # both_enabled_raises above — same plugin, conflicting pins.
    plugins = {
        "oci://reg/x:tag_A": _entry(),
        "oci://reg/x:tag_B": _entry(),
    }
    with pytest.raises(idp.InstallException, match="'x'"):
        idp.check_plugin_identity_collisions(plugins)


def test_oci_ref_without_tag_does_not_crash_the_collision_check():
    # A malformed ref (no tag at all) must not crash the check — plugin_identity
    # returns None for it and it's skipped, leaving the real validation to
    # whatever else parses the ref during install.
    plugins = {
        "oci://reg/x": _entry(),
        "oci://reg/y": _entry(),
    }
    idp.check_plugin_identity_collisions(plugins)  # no raise, no crash


def test_distinct_selectors_do_not_collide():
    plugins = {
        "oci://reg/x:tag!backstage-plugin-kubernetes": _entry(),
        "oci://reg/x:tag!backstage-plugin-tech-radar": _entry(),
    }
    idp.check_plugin_identity_collisions(plugins)  # no raise


def test_intentional_same_ref_override_is_single_key_no_raise():
    # mergePlugin collapses an exact-ref override into one dict key; the check
    # never sees a collision for the legitimate override path.
    plugins = {
        "oci://reg/x:tag!backstage-plugin-kubernetes": _entry(),
    }
    idp.check_plugin_identity_collisions(plugins)  # no raise


# --- install_plugin: preInstalled directory guard -----------------------------

def test_preinstalled_with_directory_returns_config_only(tmp_path):
    (tmp_path / "my-plugin").mkdir()
    path, config = idp.install_plugin(
        {"package": "my-plugin", "preInstalled": True, "pluginConfig": {"a": 1}},
        {}, str(tmp_path))
    assert path is None
    assert config == {"a": 1}


def test_preinstalled_without_directory_raises_naming_the_plugin(tmp_path):
    with pytest.raises(idp.InstallException, match="my-plugin"):
        idp.install_plugin(
            {"package": "my-plugin", "preInstalled": True}, {}, str(tmp_path))


def test_preinstalled_internal_workspace_plugin_is_exempt_from_dir_check(tmp_path):
    # internal-* packages are compiled into the app bundle; their entry exists
    # only to deliver pluginConfig and has no dir under dynamic-plugins-root.
    path, config = idp.install_plugin(
        {"package": "internal-plugin-dynamic-plugins-info", "preInstalled": True,
         "pluginConfig": {"b": 2}},
        {}, str(tmp_path))
    assert path is None
    assert config == {"b": 2}


def test_disabled_preinstalled_skips_before_the_directory_check(tmp_path):
    # disabled entries must keep short-circuiting first — an inert catalog
    # stub without bytes on disk is not an error.
    path, config = idp.install_plugin(
        {"package": "absent-plugin", "preInstalled": True, "disabled": True},
        {}, str(tmp_path))
    assert (path, config) == (None, {})


# --- parse_oci_package --------------------------------------------------------

def test_parse_oci_package_with_selector():
    parsed = idp.parse_oci_package("oci://reg/backstage:bs_1.49.4!backstage-plugin-kubernetes")
    assert parsed == {
        "image": "oci://reg/backstage:bs_1.49.4",
        "repo": "oci://reg/backstage",
        "tag": "bs_1.49.4",
        "selector": "backstage-plugin-kubernetes",
    }


def test_parse_oci_package_bare():
    parsed = idp.parse_oci_package("oci://quay.io/veecode/backstage-plugin-mcp-actions-backend:bs_1.52.0__0.1.14")
    assert parsed == {
        "image": "oci://quay.io/veecode/backstage-plugin-mcp-actions-backend:bs_1.52.0__0.1.14",
        "repo": "oci://quay.io/veecode/backstage-plugin-mcp-actions-backend",
        "tag": "bs_1.52.0__0.1.14",
        "selector": None,
    }


def test_parse_oci_package_registry_with_port():
    # The tag must be split from the last `:`, not the first — a registry
    # host:port would otherwise be mistaken for the tag separator.
    parsed = idp.parse_oci_package("oci://localhost:5000/veecode/plugin-x:bs_1.52.0__1.0.0")
    assert parsed["repo"] == "oci://localhost:5000/veecode/plugin-x"
    assert parsed["tag"] == "bs_1.52.0__1.0.0"


def test_parse_oci_package_no_tag_raises():
    with pytest.raises(idp.InstallException, match="no tag"):
        idp.parse_oci_package("oci://reg/backstage")


# --- resolve_inherit_refs -----------------------------------------------------

def test_inherit_resolves_against_single_concrete_match():
    allPlugins = {
        "oci://reg/plugin-x:bs_1.52.0__1.0.0": {"package": "oci://reg/plugin-x:bs_1.52.0__1.0.0", "disabled": True},
        "oci://reg/plugin-x:{{inherit}}": {"package": "oci://reg/plugin-x:{{inherit}}", "disabled": False},
    }
    resolved = idp.resolve_inherit_refs(allPlugins, "dynamic-plugins.yaml")
    assert list(resolved.keys()) == ["oci://reg/plugin-x:bs_1.52.0__1.0.0"]
    entry = resolved["oci://reg/plugin-x:bs_1.52.0__1.0.0"]
    # the inherit entry's own fields (disabled: False here) win over the base's.
    assert entry["disabled"] is False
    assert entry["package"] == "oci://reg/plugin-x:bs_1.52.0__1.0.0"


def test_inherit_matches_by_selector_too():
    allPlugins = {
        "oci://reg/workspace:bs_1.49.4!plugin-a": {"package": "oci://reg/workspace:bs_1.49.4!plugin-a"},
        "oci://reg/workspace:bs_1.49.4!plugin-b": {"package": "oci://reg/workspace:bs_1.49.4!plugin-b"},
        "oci://reg/workspace:{{inherit}}!plugin-b": {"package": "oci://reg/workspace:{{inherit}}!plugin-b"},
    }
    resolved = idp.resolve_inherit_refs(allPlugins, "dynamic-plugins.yaml")
    assert "oci://reg/workspace:bs_1.49.4!plugin-b" in resolved
    assert "oci://reg/workspace:bs_1.49.4!plugin-a" in resolved
    assert len(resolved) == 2  # the two plugin-b refs collapsed into one


def test_inherit_with_no_match_raises():
    allPlugins = {
        "oci://reg/plugin-x:{{inherit}}": {"package": "oci://reg/plugin-x:{{inherit}}"},
    }
    with pytest.raises(idp.InstallException, match="found 0 matching"):
        idp.resolve_inherit_refs(allPlugins, "dynamic-plugins.yaml")


def test_inherit_with_ambiguous_match_raises():
    allPlugins = {
        "oci://reg/plugin-x:tag_A": {"package": "oci://reg/plugin-x:tag_A"},
        "oci://reg/plugin-x:tag_B": {"package": "oci://reg/plugin-x:tag_B"},
        "oci://reg/plugin-x:{{inherit}}": {"package": "oci://reg/plugin-x:{{inherit}}"},
    }
    with pytest.raises(idp.InstallException, match="found 2 matching"):
        idp.resolve_inherit_refs(allPlugins, "dynamic-plugins.yaml")


def test_no_inherit_entries_returns_input_unchanged():
    allPlugins = {
        "oci://reg/plugin-x:bs_1.52.0__1.0.0": {"package": "oci://reg/plugin-x:bs_1.52.0__1.0.0"},
        "some-npm-package": {"package": "some-npm-package"},
    }
    assert idp.resolve_inherit_refs(allPlugins, "dynamic-plugins.yaml") is allPlugins


# --- OciDownloader: bare-ref plugin path resolution ---------------------------

def _dynamic_packages_annotation(plugin_path, name="@backstage/plugin-x-dynamic", version="1.0.0"):
    payload = [{plugin_path: {"name": name, "version": version}}]
    return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")


def test_parse_with_selector_does_not_call_skopeo(tmp_path):
    with patch.object(idp.OciDownloader, "__init__", lambda self, destination: None):
        downloader = idp.OciDownloader(str(tmp_path))
    downloader.image_to_pluginpath = {}
    with patch.object(idp.OciDownloader, "skopeo") as mock_skopeo:
        image, plugin_path = downloader._parse("oci://reg/backstage:bs_1.49.4!backstage-plugin-kubernetes")
    assert (image, plugin_path) == ("oci://reg/backstage:bs_1.49.4", "backstage-plugin-kubernetes")
    mock_skopeo.assert_not_called()


def test_parse_bare_ref_autodetects_from_manifest_annotation(tmp_path):
    with patch.object(idp.OciDownloader, "__init__", lambda self, destination: None):
        downloader = idp.OciDownloader(str(tmp_path))
    downloader.image_to_pluginpath = {}
    manifest = {"annotations": {"io.backstage.dynamic-packages": _dynamic_packages_annotation("backstage-plugin-mcp-actions-backend")}}
    with patch.object(idp.OciDownloader, "skopeo", return_value=json.dumps(manifest).encode("utf-8")):
        image, plugin_path = downloader._parse("oci://quay.io/veecode/backstage-plugin-mcp-actions-backend:bs_1.52.0__0.1.14")
    assert plugin_path == "backstage-plugin-mcp-actions-backend"


def test_parse_bare_ref_falls_back_to_repo_name_without_annotation(tmp_path):
    with patch.object(idp.OciDownloader, "__init__", lambda self, destination: None):
        downloader = idp.OciDownloader(str(tmp_path))
    downloader.image_to_pluginpath = {}
    manifest = {"annotations": {}}
    with patch.object(idp.OciDownloader, "skopeo", return_value=json.dumps(manifest).encode("utf-8")):
        image, plugin_path = downloader._parse("oci://quay.io/veecode/backstage-plugin-mcp-actions-backend:bs_1.52.0__0.1.14")
    assert plugin_path == "backstage-plugin-mcp-actions-backend"


def test_parse_bare_ref_falls_back_when_annotation_names_multiple_plugins(tmp_path):
    with patch.object(idp.OciDownloader, "__init__", lambda self, destination: None):
        downloader = idp.OciDownloader(str(tmp_path))
    downloader.image_to_pluginpath = {}
    payload = [{"plugin-a": {"name": "a"}}, {"plugin-b": {"name": "b"}}]
    encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")
    manifest = {"annotations": {"io.backstage.dynamic-packages": encoded}}
    with patch.object(idp.OciDownloader, "skopeo", return_value=json.dumps(manifest).encode("utf-8")):
        image, plugin_path = downloader._parse("oci://quay.io/veecode/workspace-image:bs_1.52.0__1.0.0")
    # ambiguous — no `!selector` to pick one, so falls back to the repo name
    assert plugin_path == "workspace-image"


def test_parse_bare_ref_caches_pluginpath_per_image(tmp_path):
    with patch.object(idp.OciDownloader, "__init__", lambda self, destination: None):
        downloader = idp.OciDownloader(str(tmp_path))
    downloader.image_to_pluginpath = {}
    manifest = {"annotations": {}}
    with patch.object(idp.OciDownloader, "skopeo", return_value=json.dumps(manifest).encode("utf-8")) as mock_skopeo:
        downloader._parse("oci://quay.io/veecode/plugin-x:bs_1.52.0__1.0.0")
        downloader._parse("oci://quay.io/veecode/plugin-x:bs_1.52.0__1.0.0")
    assert mock_skopeo.call_count == 1
