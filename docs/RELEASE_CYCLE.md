# Release Cycle

Releases publish the `docker.io/veecode/devportal-platform:<version>`
image (plus `:latest`) to Docker Hub.

The publish workflow is **tag-driven AND manual-dispatch** ([`.github/workflows/publish.yml`](../.github/workflows/publish.yml)). Releases can be initiated by pushing a semver tag (`git tag 0.2.0 && git push --tags`) or by manual dispatch (`gh workflow run publish.yml -f version=0.2.0`). A matrix-based smoke gate (13 preset boot tests + 1 negative regression) validates the amd64 image before push.

## How to release

1. **Bump `package.json` version.** Pick a semver.
   ```bash
   yq -i -o=json '.version = "0.2.0"' package.json
   ```
2. **Commit the bump.**
   ```bash
   git add package.json
   git commit -m "chore: release 0.2.0"
   ```
3. **Push to `main`** (via PR — see [`CLAUDE.md`](../CLAUDE.md)
   § "Git Workflow" for the trunk-based-development rules).
4. **Run the publish workflow.**
   ```bash
   gh workflow run publish.yml -f version=0.2.0
   ```
   Or via the GitHub UI: Actions → "Publish" → "Run workflow" → fill
   in `version`.
5. **Wait for the workflow.** It runs three jobs:
   - `validate-version` — checks the input matches `package.json`
     `version` and is a clean semver
     (`^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$`). Exits with a
     clear error if either check fails.
   - `build` — matrix build on `linux/amd64` (ubuntu-latest) and
     `linux/arm64` (ubuntu-22.04-arm). Pushes per-arch tags:
     `veecode/devportal-platform:<version>-amd64` and
     `…-arm64`.
   - `manifest` — stitches a multi-arch manifest under both
     `<version>` and `latest` via
     `docker buildx imagetools create`.

If the workflow succeeds, the image is live at:

- `docker.io/veecode/devportal-platform:<version>`
- `docker.io/veecode/devportal-platform:latest`

## What the workflow needs

Configured as repo or org secrets:

- `DOCKER_USERNAME` / `DOCKER_PASSWORD` — Docker Hub push creds.

That's it. No Red Hat credentials are needed — UBI is pulled from
the anonymous mirror ([`adr/012-anonymous-ubi-mirror.md`](adr/012-anonymous-ubi-mirror.md)).

## Validate-version safety gate

The `validate-version` job hardens against shell injection from the
manual-dispatch input. The regex check rejects anything with shell
metacharacters; the package-version cross-check ensures the
operator's input matches the committed semver. Both must pass before
the image build runs.

If you need to publish a pre-release:

```bash
# Bump package.json
yq -i -o=json '.version = "0.2.0-rc.1"' package.json
# Commit, push, dispatch
gh workflow run publish.yml -f version=0.2.0-rc.1
```

`0.2.0-rc.1` is accepted by the semver regex. The `:latest` tag is
still moved to point at the pre-release — which may not be what you
want for a pre-release. If you have a stable `:latest`, hold off
running the manifest job for pre-release versions (currently the
workflow always writes both tags; see "Future work" below).

## Inspecting a release

```bash
# Pull manifest
docker buildx imagetools inspect veecode/devportal-platform:0.2.0

# Pull and run
docker run -p 7007:7007 veecode/devportal-platform:0.2.0
```

Inside the container, `/app/devportal.json` carries the version:

```bash
docker run --rm veecode/devportal-platform:0.2.0 cat /app/devportal.json
# => {"version":"0.2.0"}
```

The About plugin reads this and exposes it on the `/about` page.

## After publishing

- The Security Scan workflow
  ([`.github/workflows/security-scan.yml`](../.github/workflows/security-scan.yml))
  runs on schedule (`0 10 * * 1-5`) and on demand
  (`workflow_dispatch`). It scans `:latest` by default; if you want
  to scan a specific version, pass `image_tag` as input. See
  [`SECURITY_SCAN_AND_FIX.md`](SECURITY_SCAN_AND_FIX.md).
- There is currently no GitHub Release object created — the
  workflow only publishes the image. Drafting release notes is a
  manual step (the `scripts/generate-release-notes.sh` helper exists
  but is not wired to the workflow).

## Future work

The publish workflow has a few rough edges that are deferred until
the product is shipping to real consumers:

- **Always-moving `:latest`.** Pre-releases overwrite `:latest`. The
  `manifest` job runs unconditionally. Either gate the `:latest`
  retag by `validate-version` checking for a `-` in the input, or
  split into two workflows.
- **No GitHub Release artifact.** Adding a `softprops/action-gh-release`
  step that uses `generate-release-notes.sh` would close this.
- **No SBOM attestation.** The image carries no signed SBOM today.
  `docker buildx build --sbom=true --provenance=true` is a one-line
  add when there's a consumer who'll verify it.

None of these are blockers for the current cadence.
