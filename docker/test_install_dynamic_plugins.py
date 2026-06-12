"""Tests for install-dynamic-plugins.py — duplicate plugin detection."""
import importlib.util
from pathlib import Path

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


def test_identity_oci_ref_without_selector_is_none():
    assert idp.plugin_identity("oci://reg/backstage:bs_1.49.4") is None


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


def test_malformed_oci_ref_without_selector_does_not_crash():
    plugins = {
        "oci://reg/x:tag_A": _entry(),
        "oci://reg/x:tag_B": _entry(),
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
