# Roadmap — Features

What's planned for `devportal-platform` beyond the current shipped
scope. This is a snapshot, not a commitment; running priorities live
in Notion. Anything truly committed will turn up as an Issue and a
corresponding branch.

## Near term (next few releases)

- **More integration presets.** Argo CD, OpenShift, GitOps. The
  scaffolder modules and frontend wrappers for some of these already
  exist statically (e.g. `@roadiehq/scaffolder-backend-argocd`); the
  preset packaging is the missing piece.
- **A "first-run" preset** that flips on a minimal set for a fresh
  evaluator (probably just `recommended,veecode-theme` with sample
  data trimmed). Today the operator has to know what to ask for.
- **PR-time image build smoke test.** Currently
  [`pr-check.yml`](../.github/workflows/pr-check.yml) runs
  tsc/lint/test only — it doesn't build the Docker image. A breaking
  Dockerfile change only surfaces at publish time.

## Mid term

- **Drop the cbme stopgap.** When
  `devportal-plugin-export-overlays` publishes
  `quay.io/veecode/extensions:bs_1.50.0` (or whichever Backstage
  version is next), the `/alpha → main` `sed` patch in the
  Dockerfile can go ([`UPGRADING.md`](UPGRADING.md) § Track 3
  documents the cleanup).
- **Tag-driven publishing.** The workflow has it commented out; flip
  on when there's a real consumer
  ([`RELEASE_CYCLE.md`](RELEASE_CYCLE.md) § "Switching to
  tag-driven").
- **Backstage 1.50 migration.** Pinned at 1.49.4 today. The bump is
  not gated on anything in this repo — gated on confidence about the
  cbme module and any RHDH-shell changes.

## Long term

- **New Frontend System migration** (ADR-011 § Phase 2). The
  declarative-extensions / blueprint model. Gated on NFS core going
  `@public`, `@backstage/frontend-dynamic-feature-loader` leaving
  experimental, and RHDH publishing a Scalprum→NFS migration path.
  No date.
- **BUI as primary component kit.** Currently coexists with MUI; the
  long-term direction is replacing the MUI surfaces with BUI as the
  upstream MUI→BUI migration ratchets forward (tracked at
  backstage/backstage#31467). Gated on BUI hitting MUI parity, which
  it isn't close to yet.
- **Profile-to-preset customer migration tooling.** A migration
  script for operators currently on `VEECODE_PROFILE=<x>` (the
  `devportal-base` model) to translate their config into a
  `VEECODE_PRESETS=…` equivalent. Worth doing once we have actual
  customers asking.

## What's _not_ on the roadmap

Documented to make scope decisions easier:

- **Forking Backstage.** We track upstream and the RHDH-derived shell
  pieces; we don't fork.
- **A `devportal-base` ↔ `devportal-platform` compatibility bridge.**
  The two repos serve different product moments. Operators don't
  need both running side-by-side.
- **An IDE plugin / electron app / VSCode extension.** Out of scope
  for the image.
- **Tenant-aware multi-tenancy in this image.** A customer deploys
  their own copy.

For the technical-debt / deferred-items list, see
[`ROADMAP_BACKLOG.md`](ROADMAP_BACKLOG.md).
