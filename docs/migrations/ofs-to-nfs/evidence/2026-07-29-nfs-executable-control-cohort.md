# Executable NFS host and five-case control cohort

**Date:** 2026-07-29

**Status:** human checkpoint recorded; no repair, merge, publication or
promotion was opened

**Target:** Backstage `1.53.0`, NFS mode, minimal `app-next` shell

## Frozen provenance

| Item | Value |
| --- | --- |
| Platform checkout at execution | `c5c404a1bfb29741cb96d8406bd7ed99e798f4ca` |
| Drydock checkout at execution | `85696627913f8b275efe17ef158072d92ae28d20` |
| Export-overlays checkout | `19d46fbad8c37bd78ad317ccc929d01994f0528f` |
| Local NFS image | `veecode/devportal-nfs:2.3.0-rc.2-nfs-local` |
| Local image digest | `sha256:6337b556c3b253602d510bb37afcd274920a066719291e27b36226e15ff89c35` |
| Publication state | local tag only; no push and no mutable-pointer movement |

The image digest identifies the locally built image used by Gate 0, Gate 1 and
the Drydock batch. The OFS Dockerfile and OFS image were not modified.

## Gate 0 — shell boot and selection

The following passed against the isolated NFS path:

- `yarn install --immutable` after the loader dependency was locked;
- `yarn workspace app-next tsc`;
- `yarn workspace app-next build`;
- backend build with the compiled `app-next/dist` present in the backend bundle;
- `bash -n docker/entrypoint.nfs.sh scripts/build-local-nfs-image.sh`;
- isolated versioned image build through
  `scripts/build-local-nfs-image.sh --skip-build` (the pinned base and the
  script's `--no-cache` option provide the reproducibility boundary);
- image inspection showing only the versioned local tag.

The container was started with `app-config.nfs.yaml` selected through the NFS
entrypoint. It returned:

- `GET /.backstage/health/v1/readiness` → HTTP `200`, `{"status":"ok"}`;
- `GET /.backstage/dynamic-features/remotes` → HTTP `200`, `[]` with the
  intentionally empty default dynamic-plugin file;
- the backend log explicitly selected
  `/app/packages/app-next/dist` for static app content.

This is Gate 0 for the NFS arm only. It does not establish VeeCode shell
parity.

## Gate 1 — Kubernetes static reference

The Kubernetes reference fixture is
`packages/app-next/fixtures/kubernetes-control.yaml`. The positive probe used
the current artifact
`oci://quay.io/veecode/backstage:bs_1.53.0!backstage-plugin-kubernetes`.
The resolved cached OCI manifest had config digest
`sha256:f5245b540042ee8337f3b6243f7e1ffa88f18b323f87db420eb67c03607f290e`
and layer digest
`sha256:1b17a969e7be374cb2640f766fc58e59ae5caed6dca73d331198f6e00e508a0a`.

The container returned readiness `200` and exposed:

```json
[{"packageName":"@backstage/plugin-kubernetes-dynamic","remoteInfo":{"name":"backstage__plugin_kubernetes","entry":"http://localhost:17008/.backstage/dynamic-features/remotes/@backstage/plugin-kubernetes-dynamic/mf-manifest.json"},"exposedModules":[".","alpha"]}]
```

The manifest endpoint returned a valid Module Federation manifest with
`backstage__plugin_kubernetes`, a `remoteEntry`, and `.`/`alpha` exports. The
browser probe `scripts/smoke-nfs-browser.mjs` exited `0` and asserted all of
the following:

- the guest entry completed;
- the dynamic-feature remotes endpoint was requested;
- the Module Federation manifest and `remoteEntry.js` were requested;
- the Kubernetes reference entity rendered `Your Clusters` / `No Kubernetes
  resources`;
- no page or console errors were observed.

This proves loader installation, remotes discovery, MF loading and one
fixture-backed Kubernetes surface. There is no live cluster-connectivity
claim.

## Cohort execution

Facts were collected from the current artifacts with:

```text
DRYDOCK_FRONTEND_SYSTEM=nfs BUNDLE_TAG_OVERRIDE=bs_1.53.0 \
DRYDOCK_NFS_FACTS_DIR=/tmp/nfs-control-cohort/facts \
DRYDOCK_METADATA_WARNINGS_DIR=/home/gio/devportal/devportal-platform/docs/migrations/ofs-to-nfs/evidence/fixtures/nfs-control-cohort \
IMAGE=veecode/devportal-nfs:2.3.0-rc.2-nfs-local \
DRYDOCK_NAME=nfs-control-batch \
DRYDOCK_OUT_DIR=/tmp/nfs-control-cohort/out \
DRYDOCK_REPORT_DIR=/tmp/nfs-control-cohort/report \
rtk ./harness/batch/run-batch.sh /tmp/nfs-control-cohort/overlays \
  kubernetes,github-workflows,marketplace,veecode-theme,github-auth
```

The command was run from the Drydock checkout root
`/home/gio/devportal/veecode-drydock`.

The run used no normalizer, revision, Factory or repair step. It produced five
case report directories and the frozen raw matrix
[`matrix-report.md`](fixtures/nfs-control-cohort/matrix-report.md). A search
of `/tmp/nfs-control-cohort/report` and `/tmp/nfs-control-cohort/out` found no
`author-example` fallback.

The current artifacts and source provenance were:

| Case | Source provenance | Artifact |
| --- | --- | --- |
| Kubernetes | Backstage `1.53.0` reference fixture | `oci://quay.io/veecode/backstage:bs_1.53.0!backstage-plugin-kubernetes` |
| GitHub Workflows | VeeCode export source `f3f95e06510863272006e3b305516509df4166df` | `oci://quay.io/veecode/github-workflows:bs_1.53.0!veecode-platform-backstage-plugin-github-workflows` |
| Marketplace | VeeCode export source `23f538f55731a887391241d8444af2586205a600` | `oci://quay.io/veecode/marketplace:bs_1.53.0!devportal-marketplace-frontend-dynamic` |
| VeeCode Theme | VeeCode export source `f3f95e06510863272006e3b305516509df4166df` | `oci://quay.io/veecode/veecode-theme:bs_1.53.0!veecode-platform-plugin-veecode-theme` |
| GitHub + `github-auth` | GitHub source `97599a21566d6bc91a55555e271770b24ad91679`; auth contract in `presets/github-auth.yaml` | `oci://quay.io/veecode/github:bs_1.53.0!backstage-community-plugin-github-actions` |

### Case classifications

| Case | Classification | Raw report | Evidence and boundary |
| --- | --- | --- | --- |
| Kubernetes | `runtime-verified` | `kubernetes/backstage-plugin-kubernetes/metadata-defect.json` and matrix `R0-METADATA-DEFECT` | Gate 1 manually proved the current artifact and fixture in the browser. Drydock separately reports that the exported package has no metadata file. No live cluster was used. |
| GitHub Workflows | `coverage-gap` | `github-workflows/veecode-platform-backstage-plugin-github-workflows/rungs.json` → `NFS_REMOTE_MISSING`; `probe-plan.json` → `NFS_SURFACE_UNMAPPED` | The container log proves the dynamic plugin loaded and `/remotes` exposed `@veecode-platform/backstage-plugin-github-workflows-dynamic`. The harness claims the source package name without the `-dynamic` suffix, and the current metadata has no NFS composition declaration. This is not evidence of a broken artifact. |
| Marketplace | `requires-port` | `marketplace/devportal-marketplace-frontend-dynamic/r2.json` → `NFS_SURFACE_UNMAPPED` | The current artifact loaded and exposed only `.`; the current package metadata still describes legacy routes and has no explicit NFS alpha surface. An NFS export/port decision is required before a user-facing claim. |
| VeeCode Theme | `requires-port` | `veecode-theme/veecode-platform-plugin-veecode-theme/r2.json` → `NFS_SURFACE_UNMAPPED` | The current artifact loaded and exposed only `.` while the current contract is OFS `themes` (`light`/`dark`). Theme/provider migration is required; this is not a browser parity claim. |
| GitHub + `github-auth` | `config-scenario` | `github-auth/backstage-community-plugin-github-actions/r2.json` → `NFS_SURFACE_UNMAPPED` | `presets/github-auth.yaml` is configuration-only (`plugins: []`) and supplies auth/catalog/sign-in behavior. The GitHub Actions artifact loaded, but OAuth/org configuration was not exercised with credentials. The composed contract remains a configuration scenario. |

No case was classified `broken`. Four raw `R1-OK` rows in the matrix are
explicit NFS coverage outcomes; they must not be read as four green NFS
results. The source-package versus `-dynamic` endpoint-name mismatch and the
missing `spec.nfs.composition` metadata are coverage limitations now visible
in the report.

## OFS control

The existing OFS container was stopped only to release the host port while the
NFS probes ran, then restarted without image or Dockerfile changes. Its
readiness endpoint returned HTTP `200` with `{"status":"ok"}` on port `7007`
after restoration. No OFS publication or promotion was performed.

## Decision at checkpoint

Gates 0 and 1 are evidenced for the isolated NFS arm, and the five-case
control cohort has honest reports. The result is not a production NFS
graduation and does not authorize automatic repairs. The next action is a
human selection of porting and coverage work based on this frozen boundary.
