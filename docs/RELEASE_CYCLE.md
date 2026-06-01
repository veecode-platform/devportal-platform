# Release Cycle

Releases publish the `docker.io/veecode/devportal:<version>` image (multi-arch
amd64 + arm64) to Docker Hub, create a GitHub Release with an SBOM, and then
validate the real install path on Kubernetes.

There is **one** way to cut a release: the **Release** workflow
([`.github/workflows/release.yml`](../.github/workflows/release.yml)),
triggered by manual dispatch. It does everything — bump, changelog, commit,
tag — and the tag it pushes triggers **Publish**. Do **not** bump
`package.json` by hand or run Publish directly; that older two-step path is
gone.

## How to release

```bash
gh workflow run release.yml -f version=2.1.0
```

Or via the GitHub UI: Actions → "Release" → "Run workflow" → fill in
`version`. The `version` input is an explicit semver and supports any bump —
patch, minor, major, or a prerelease (`2.1.0-rc.1`).

The Release workflow then (via `make release VERSION=<version>`):

1. Validates the version shape and that the tag does not already exist.
2. Generates `CHANGELOG.md` notes from the commits since the last tag.
3. Sets `package.json` `version`, commits `chore: release <version>`, and
   pushes to `main` with the default `GITHUB_TOKEN` (main is not branch-protected).
4. Creates and pushes the annotated tag `<version>`, then triggers **Publish**.

Publish ([`.github/workflows/publish.yml`](../.github/workflows/publish.yml)) is
triggered **explicitly via `workflow_dispatch`**, not by the tag push. GitHub
suppresses workflow triggers from `GITHUB_TOKEN`-authored events, so a
`GITHUB_TOKEN`-pushed tag would not fire Publish — but a `workflow_dispatch` from
`GITHUB_TOKEN` is allowed. (A tag pushed by a human with their own credentials
still fires Publish directly.)

## What Publish does

Tag-driven (or manual-dispatch fallback). The pipeline:

1. **`validate-tag`** — version is clean semver, matches `package.json`, and
   (for stable tags pushed by Release) the tag commit is reachable from
   `main`. Detects prereleases (`-rc`/`-alpha`/`-beta`/`-preview`).
2. **`gen-matrix`** — derives the smoke matrix from
   [`scripts/smoke-presets.sh`](../scripts/smoke-presets.sh) `--list-json`.
   This is the **single source of truth** for which presets are smoke-tested;
   there is no hand-maintained parallel list. (A past divergence let the
   github-auth bug ship in 0.1.0.)
3. **`build-amd64-test`** — builds amd64 into the local daemon (no push),
   saves it as a tarball artifact.
4. **`build-arm64`** — builds and pushes the arm64 per-arch tag in parallel.
5. **`smoke`** — matrix of every preset/composition from `gen-matrix`, each
   booting the amd64 tarball in `docker run` and asserting healthcheck +
   plugin load. **`smoke-negative`** asserts a clean fail-fast on incomplete
   config.
6. **`push-amd64`** — pushes the amd64 per-arch tag **only if** smoke and
   smoke-negative both pass (smoke-before-publish gate).
7. **`manifest`** — stitches the multi-arch manifest `<version>` from the two
   per-arch tags.
8. **`github-release`** — generates an SBOM (SPDX + CycloneDX) from the
   published image, creates the GitHub Release for the tag with
   auto-generated notes, and attaches the SBOM as release assets.

If Publish succeeds, the image is live at:

- `docker.io/veecode/devportal:<version>`
- `docker.io/veecode/devportal:<version>-amd64`
- `docker.io/veecode/devportal:<version>-arm64`

## The `:latest` tag — do NOT move it to V2 yet

> **Hard constraint.** The `veecode/devportal` image repo serves **both** the
> 1.x line (V1, the old distro) and the 2.x line (V2, this platform). V1 is
> still live and in use; the V2 rollout is not complete. Moving `:latest` to a
> V2 image **breaks V1 consumers** who pull `:latest`.

`:latest` promotion is therefore **opt-in and deliberate**, never an automatic
side effect of publishing a tag. Publish moves `:latest` only on a
`workflow_dispatch` with `update_latest=true` — and the team simply does not
use that for V2 until the rollout completes. Prereleases never move `:latest`.

When V2 rollout is ready, promote without a rebuild:

```bash
docker buildx imagetools create -t veecode/devportal:latest \
  veecode/devportal:<version>-amd64 veecode/devportal:<version>-arm64
```

## Post-publish validation (VKDR install E2E)

[`.github/workflows/vkdr-install-e2e.yml`](../.github/workflows/vkdr-install-e2e.yml)
runs after Publish (and on-demand) to validate the **supported install path**:
`vkdr devportal-platform install` → published `veecode-devportal-platform`
Helm chart → k3d → `/healthcheck`. It covers what the docker-run smoke matrix
cannot: chart correctness, Kong ingress, Secret wiring, and Ready-under-k8s.

It is a **canary / status report** — it does **not** move `:latest` or any
pointer (see the constraint above). It is the evidence the team consults
before any rollout decision.

Because `vkdr devportal-platform install` uses the chart's default `image.tag`,
the workflow passes `--merge-values` to pin the freshly-published `<version>`.
Run it manually against any published tag:

```bash
gh workflow run vkdr-install-e2e.yml -f image_tag=2.1.0
```

> Cross-repo note: the chart's default `image.tag` (in
> [`next-charts`](https://github.com/veecode-platform/next-charts)) is versioned
> independently of the image. A plain `vkdr install` (no override) gets the
> chart-default image, which can lag the newest image. Bump the chart's
> `appVersion` + `image.tag` in lockstep with image releases (chart-repo work).

## What the pipeline needs

Repo or org secrets:

- `DOCKER_USERNAME` / `DOCKER_PASSWORD` — Docker Hub push creds.

No `RELEASE_TOKEN` is needed — `main` is not branch-protected, so Release pushes
with the default `GITHUB_TOKEN` and triggers Publish via `workflow_dispatch`. (If
`main` is ever protected, Release will need a PAT/App token with bypass to push the
bump commit.) No Red Hat credentials are needed — UBI is pulled from the anonymous mirror
([`adr/012-anonymous-ubi-mirror.md`](adr/012-anonymous-ubi-mirror.md)).

## Inspecting a release

```bash
docker buildx imagetools inspect veecode/devportal:2.1.0   # manifest
docker run -p 7007:7007 veecode/devportal:2.1.0            # run
docker run --rm veecode/devportal:2.1.0 cat /app/devportal.json   # => {"version":"2.1.0"}
```

The About plugin reads `/app/devportal.json` and exposes the version on the
`/about` page.

## Prerelease example

```bash
gh workflow run release.yml -f version=2.1.0-rc.1
```

Prereleases skip the main-ancestry check, are marked `prerelease` on the
GitHub Release, and never move `:latest`.

## Failed-release recovery

Fix the code and cut a **new** version. Reusing a failed tag requires
force-pushing it — deliberate friction.

## Future work

- **Signed image attestation (cosign/provenance).** The image carries an SBOM
  as a GitHub Release asset, but no signed in-registry attestation. The amd64
  `load → docker push` path strips buildx attestations; adding cosign or
  switching amd64 to a direct `build-push` (losing the smoke-before-push gate
  on the local tarball) is the trade-off to resolve when a consumer needs it.
- **Chart ↔ image version sync** in `next-charts` (cross-repo), so a plain
  `vkdr install` gets the matching image without an override.
