"""Tests for install-dynamic-plugins.py — duplicate plugin detection."""
import importlib.util
import json
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


# --- check_backend_plugin_id_collisions ---------------------------------------

def _plugin_dir(root, dir_name, role, plugin_id, extra=None):
    d = root / dir_name
    d.mkdir()
    backstage = {"role": role}
    if plugin_id is not None:
        backstage["pluginId"] = plugin_id
    package_json = {"name": dir_name, "version": "0.0.0", "backstage": backstage}
    if extra:
        package_json.update(extra)
    (d / "package.json").write_text(json.dumps(package_json))
    return d


def test_two_backend_plugins_same_plugin_id_raises(tmp_path):
    _plugin_dir(tmp_path, "devportal-marketplace-backend-dynamic", "backend-plugin", "extensions")
    _plugin_dir(tmp_path, "red-hat-developer-hub-backstage-plugin-extensions-backend-dynamic",
                "backend-plugin", "extensions")
    with pytest.raises(idp.InstallException, match="extensions"):
        idp.check_backend_plugin_id_collisions(str(tmp_path))


def test_frontend_and_backend_of_same_plugin_share_plugin_id_no_raise(tmp_path):
    # The marketplace pairing this check must never break: the frontend and
    # backend of ONE plugin register the same pluginId on purpose, and only
    # the backend side counts toward a collision.
    _plugin_dir(tmp_path, "devportal-marketplace-backend-dynamic", "backend-plugin", "extensions")
    _plugin_dir(tmp_path, "devportal-marketplace-frontend-dynamic-dynamic", "frontend-plugin", "extensions")
    idp.check_backend_plugin_id_collisions(str(tmp_path))  # no raise


def test_backend_plugin_modules_targeting_same_plugin_id_do_not_collide(tmp_path):
    # Several backend-plugin-module entries extending the same host plugin
    # (e.g. catalog) is the normal, supported shape — not a registration.
    _plugin_dir(tmp_path, "catalog-backend-module-extensions-dynamic", "backend-plugin-module", "catalog")
    _plugin_dir(tmp_path, "catalog-backend-module-github-dynamic", "backend-plugin-module", "catalog")
    idp.check_backend_plugin_id_collisions(str(tmp_path))  # no raise


def test_distinct_plugin_ids_do_not_collide(tmp_path):
    _plugin_dir(tmp_path, "plugin-a", "backend-plugin", "a")
    _plugin_dir(tmp_path, "plugin-b", "backend-plugin", "b")
    idp.check_backend_plugin_id_collisions(str(tmp_path))  # no raise


def test_directory_without_package_json_is_ignored(tmp_path):
    (tmp_path / "install-dynamic-plugins.lock").write_text("")
    (tmp_path / "some-dir-with-no-manifest").mkdir()
    idp.check_backend_plugin_id_collisions(str(tmp_path))  # no raise, no crash


def test_malformed_package_json_is_ignored_not_crashed(tmp_path):
    d = tmp_path / "corrupt-plugin"
    d.mkdir()
    (d / "package.json").write_text("{not valid json")
    idp.check_backend_plugin_id_collisions(str(tmp_path))  # no raise, no crash


# --- static (host) pluginIds count as occupants --------------------------------
#
# Backstage detects a duplicate pluginId in BackendInitializer, but its recovery
# deletes the whole slot: BOTH the static and the dynamic plugin then fail to
# initialize, and the default onPluginBootFailure ('abort') takes the backend
# down. packages/backend/src/index.ts:230-233 records that happening for
# mcp-actions. These tests pin the refusal to install time instead.

def _static_ids_file(monkeypatch, tmp_path, ids):
    """Point the check at a temporary static-backend-plugin-ids.json.

    The production code resolves the file next to install-dynamic-plugins.py via
    __file__, so the seam under test is that directory, not an argument.
    """
    holder = tmp_path / "codedir"
    holder.mkdir()
    (holder / "static-backend-plugin-ids.json").write_text(
        json.dumps({"staticBackendPluginIds": ids}))
    monkeypatch.setattr(idp.os.path, "realpath",
                        lambda p: str(holder / "install-dynamic-plugins.py"))
    return holder


def test_dynamic_backend_colliding_with_a_static_host_plugin_id_raises(tmp_path, monkeypatch):
    root = tmp_path / "root"
    root.mkdir()
    _static_ids_file(monkeypatch, tmp_path, ["kubernetes", "catalog", "search"])
    _plugin_dir(root, "backstage-plugin-kubernetes-backend-dynamic",
                "backend-plugin", "kubernetes")
    with pytest.raises(idp.InstallException, match="STATICALLY"):
        idp.check_backend_plugin_id_collisions(str(root))


def test_static_collision_message_names_index_ts_not_disabled_flag(tmp_path, monkeypatch):
    # The remedy differs from the dynamic-vs-dynamic case: you cannot switch the
    # host off with `disabled: true`, so the message has to say so.
    root = tmp_path / "root"
    root.mkdir()
    _static_ids_file(monkeypatch, tmp_path, ["kubernetes"])
    _plugin_dir(root, "kube-be-dynamic", "backend-plugin", "kubernetes")
    with pytest.raises(idp.InstallException, match="index.ts"):
        idp.check_backend_plugin_id_collisions(str(root))


def test_backend_plugin_module_on_a_static_plugin_id_does_not_raise(tmp_path, monkeypatch):
    # THE critical non-regression. Our real catalog-backend-module-extensions has
    # pluginId `catalog`, and `catalog` IS statically registered by the host. A
    # module extends rather than registers, so several per pluginId is normal —
    # if the role filter were wrong this would break the working G1a install set.
    root = tmp_path / "root"
    root.mkdir()
    _static_ids_file(monkeypatch, tmp_path, ["catalog", "kubernetes"])
    _plugin_dir(root, "catalog-backend-module-extensions-dynamic",
                "backend-plugin-module", "catalog")
    idp.check_backend_plugin_id_collisions(str(root))  # no raise


def test_frontend_plugin_on_a_static_plugin_id_does_not_raise(tmp_path, monkeypatch):
    root = tmp_path / "root"
    root.mkdir()
    _static_ids_file(monkeypatch, tmp_path, ["catalog"])
    _plugin_dir(root, "some-catalog-frontend-dynamic", "frontend-plugin", "catalog")
    idp.check_backend_plugin_id_collisions(str(root))  # no raise


def test_dynamic_backend_on_a_free_plugin_id_does_not_raise(tmp_path, monkeypatch):
    # `extensions` is NOT statically registered — the marketplace backend must
    # still install cleanly, which is what G1a depends on.
    root = tmp_path / "root"
    root.mkdir()
    _static_ids_file(monkeypatch, tmp_path, ["catalog", "kubernetes", "search"])
    _plugin_dir(root, "devportal-marketplace-backend-dynamic", "backend-plugin", "extensions")
    idp.check_backend_plugin_id_collisions(str(root))  # no raise


def test_malformed_static_ids_file_refuses_rather_than_assuming_none(tmp_path, monkeypatch):
    # Reading a broken file as "the host registers nothing" would silently reopen
    # the exact collision this check exists to close.
    root = tmp_path / "root"
    root.mkdir()
    holder = tmp_path / "codedir"
    holder.mkdir()
    (holder / "static-backend-plugin-ids.json").write_text("{not json")
    monkeypatch.setattr(idp.os.path, "realpath",
                        lambda p: str(holder / "install-dynamic-plugins.py"))
    with pytest.raises(idp.InstallException, match="refusing to install"):
        idp.check_backend_plugin_id_collisions(str(root))


def test_absent_static_ids_file_degrades_to_dynamic_only(tmp_path, monkeypatch):
    # The OFS path has no such file; behavior there must be byte-for-byte what it
    # was before, i.e. dynamic-vs-dynamic still caught, static simply unknown.
    root = tmp_path / "root"
    root.mkdir()
    holder = tmp_path / "codedir"
    holder.mkdir()  # deliberately empty
    monkeypatch.setattr(idp.os.path, "realpath",
                        lambda p: str(holder / "install-dynamic-plugins.py"))
    _plugin_dir(root, "kube-be-dynamic", "backend-plugin", "kubernetes")
    idp.check_backend_plugin_id_collisions(str(root))  # no raise: static set unknown
    _plugin_dir(root, "kube-be-dynamic-again", "backend-plugin", "kubernetes")
    with pytest.raises(idp.InstallException, match="Two backend plugins"):
        idp.check_backend_plugin_id_collisions(str(root))


# --- the committed static list must not drift from index.ts --------------------

def test_static_backend_plugin_ids_json_matches_what_index_ts_actually_registers():
    """Re-derive the list from source and fail if the committed file disagrees.

    A hand-maintained list rots, and rotting in the "missing an id" direction is
    the dangerous one: the gate would wave through a collision that takes the
    backend down. This re-reads every backend.add(import(...)) in
    packages/backend/src/index.ts, resolves each package in node_modules, and
    pulls the pluginId out of its built bundle — the only authoritative source,
    since the package name does not determine the pluginId (plugin-app-backend
    registers "app", plugin-kubernetes-backend registers "kubernetes").

    Skipped when node_modules is absent, because then there is nothing to derive
    from and a failure here would be about the environment, not about drift.
    """
    import subprocess
    repo_root = Path(__file__).resolve().parent.parent
    if not (repo_root / "node_modules").is_dir():
        pytest.skip("node_modules absent — nothing to derive the mapping from")

    result = subprocess.run(
        ["python3", str(repo_root / "docker" / "derive-static-backend-plugin-ids.py"),
         str(repo_root)],
        capture_output=True, text=True, timeout=300,
    )
    assert result.returncode == 0, f"derivation failed:\n{result.stderr}"
    derived = json.loads(result.stdout)["staticBackendPluginIds"]

    committed = json.loads(
        (repo_root / "docker" / "static-backend-plugin-ids.json").read_text()
    )["staticBackendPluginIds"]

    missing = sorted(set(derived) - set(committed))
    extra = sorted(set(committed) - set(derived))
    assert not missing, (
        f"index.ts statically registers {missing}, absent from "
        f"static-backend-plugin-ids.json — the gate would let a dynamic plugin "
        f"claim those and take the backend down. Regenerate the file.")
    assert not extra, (
        f"static-backend-plugin-ids.json reserves {extra}, which index.ts no "
        f"longer registers — that needlessly refuses a legitimate dynamic plugin. "
        f"Regenerate the file.")
