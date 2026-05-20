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
