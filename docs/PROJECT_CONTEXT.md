> ⚠️ **MOVED.** The content of this file is being absorbed into [`docs/README.md`](README.md) as part of the docs reorganization (see [`superpowers/specs/2026-05-18-docs-concept-first-ia-design.md`](superpowers/specs/2026-05-18-docs-concept-first-ia-design.md)). New material goes in `docs/README.md` and the `docs/topics/` tree. This file will be deleted in Phase 2.

# Project Context

VeeCode DevPortal Platform (`devportal-platform`) is an open-source
Backstage distribution. It is a single, unified container image plus a
catalog of YAML _presets_ that turn it into a working Internal
Developer Platform for a specific stack. This document explains what
the project is, how it relates to the prior `devportal-base` /
`devportal-distro` split, and which decisions to read before changing
anything load-bearing.

## What this repo ships

One artifact — `docker.io/veecode/devportal-platform` — built from a
single multi-stage [`Dockerfile`](../Dockerfile) and published manually
via [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).
The image bundles:

- The Backstage frontend and backend (`packages/app` and
  `packages/backend`), built on Backstage **1.49.4** (pinned in
  [`backstage.json`](../backstage.json)).
- A pre-installed core set of dynamic plugins under
  `/app/dynamic-plugins-root/` (header, homepage, About, RBAC,
  marketplace, tech-radar, pending-changes, …).
- A preset catalog under `/app/presets/` (one YAML per preset; see
  [`presets/README.md`](../presets/README.md)).
- An [`entrypoint.sh`](../entrypoint.sh) that, at boot, reads
  `VEECODE_PRESETS`, validates required env vars, resolves OCI plugin
  references, and assembles the Backstage `--config` chain.

The image is generic by design. To turn it into an IDP for a specific
customer's stack, the operator selects presets at runtime
(`VEECODE_PRESETS=recommended,github,...`) and supplies the env vars
those presets declare as required.

## Two paths of use

The image supports two equally first-class operator paths
([`presets/README.md`](../presets/README.md) § "Two primary paths of
use"):

1. **Preset path.** `VEECODE_PRESETS=recommended,github` plus required
   env vars. The entrypoint resolves each preset into a plugin-fragment
   and an `app-config` fragment, and threads them into the runtime
   config chain. Use this when your stack matches one of the catalog
   entries.
2. **Raw Backstage path.** Leave `VEECODE_PRESETS` unset and mount your
   own `app-config.yaml`, a `dynamic-plugins.yaml` with top-level
   `plugins:` entries, and overrides via volume. The image's load order
   still applies, and the full plugin list is still assembled by the
   entrypoint at boot.

The two paths layer naturally: an operator's `app-config.local.yaml`
always wins over preset configs (precedence table in
[`entrypoint.sh:218-227`](../entrypoint.sh)). The docs in this folder
assume the preset path unless they say otherwise.

## How this differs from `devportal-base` / `devportal-distro`

`devportal-platform` is **not** a fork. It is a greenfield repo that
collapses several decisions from its sibling repos:

| Concept         | `devportal-base` + `devportal-distro`                  | `devportal-platform`                                                                                                                             |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Image topology  | Two images: base (~minimal) + distro (~base + plugins) | One unified image.                                                                                                                               |
| Stack selection | `VEECODE_PROFILE=<name>` picks one config layer        | `VEECODE_PRESETS=a,b,c` composes presets.                                                                                                        |
| Theming         | RHDH theme imported statically in `packages/app`       | Dynamic plugin (`veecode-platform-plugin-veecode-theme`) enabled by `presets/veecode-theme.yaml` ([ADR-011](adr/011-frontend-design-system.md)). |
| UBI registry    | `registry.redhat.io` (authenticated)                   | `registry.access.redhat.com` (anonymous mirror; [ADR-012](adr/012-anonymous-ubi-mirror.md)).                                                     |
| Publish         | Tag-driven                                             | Manual `workflow_dispatch` until a real consumer pulls.                                                                                          |

No content was ported wholesale. Every command, path, env var, and
default in these docs was verified against this repo's code.

If you are looking for a fact that this repo's code does not back up,
it does not exist here. Don't infer it from `devportal-base`.

## Tech stack

Pinned versions:

- **Backstage** 1.49.4 (`backstage.json`; resolutions in root
  `package.json`).
- **Node.js** 20 or 22 (engines field, root `package.json`); the image
  runs on UBI10 Node 22.
- **Yarn** 4.12.0 (`packageManager` field in `package.json`, enabled via
  Corepack).
- **React** 18.3.1 (resolution-pinned in root `package.json`).
- **MUI** 5 (`@mui/material@^5.15.10` in `packages/app/package.json`).
  Greenfield is on v5 from day one; a small `@mui/styles` `makeStyles`
  compat surface still exists in `packages/app/src/components/` (see
  [`MUI_MIGRATION_STATUS.md`](MUI_MIGRATION_STATUS.md)).
- **TypeScript** ~5.8.
- **Scalprum** + Webpack Module Federation for dynamic frontend plugin
  loading (RHDH-derived `DynamicRoot` shell).

The frontend uses Backstage's **legacy frontend system** —
`createApp` from `@backstage/app-defaults` — inside a Scalprum host.
The New Frontend System migration is deferred (ADR-011 § "Phase 2").

## Architecture at a glance

- Frontend ([`packages/app`](../packages/app/)) — a Scalprum host. Its
  `App.tsx` mounts `ScalprumRoot`, which discovers and loads dynamic
  frontend plugins from `/app/dynamic-plugins-root/<name>/dist-scalprum/`
  at runtime.
- Backend ([`packages/backend`](../packages/backend/)) — a standard
  Backstage backend with the dynamic-plugins feature loader
  (`@backstage/backend-dynamic-feature-service`). Static plugins (auth,
  catalog, scaffolder, RBAC, search, techdocs, kubernetes, …) are
  compiled in; dynamic plugins are loaded at boot from
  `/app/dynamic-plugins-root/`.
- Dynamic plugins — fetched at boot as OCI bundles
  (`oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>`),
  published by
  [`veecode-platform/devportal-plugin-export-overlays`](https://github.com/veecode-platform/devportal-plugin-export-overlays).
  The complete inventory lives in
  [`dynamic-plugins.default.yaml`](../dynamic-plugins.default.yaml).
- Internal plugins ([`plugins/`](../plugins/)) — workspace packages
  under `@internal/*` (dynamic-plugins-info, scalprum-backend).
- Presets ([`presets/`](../presets/)) — versioned YAML preset catalog.

The deeper layout and inter-package relationships are in
[`MONOREPO_STRUCTURE.md`](MONOREPO_STRUCTURE.md).

## Foundational decisions

Read these before changing anything that touches image topology,
theming, or plugin distribution.

- **[ADR-011](adr/011-frontend-design-system.md)** — Frontend design
  system. The VeeCode theme is a dynamic plugin
  (`veecode-platform-plugin-veecode-theme-dynamic`) enabled by a preset
  (`presets/veecode-theme.yaml`), not baked into `recommended`. Also
  captures the recurring authoring gotchas: `rhdh-cli plugin export`
  vs `janus-cli package export-dynamic-plugin`,
  `sideEffects: ["**/*.css"]`, React/MUI peer deps, theme id collision
  with static themes.
- **[ADR-012](adr/012-anonymous-ubi-mirror.md)** — Pull UBI from
  `registry.access.redhat.com` (anonymous) instead of
  `registry.redhat.io` (authenticated). Same image bit-for-bit; no Red
  Hat credentials needed for build.
- **`presets/README.md`** + **`presets/SCHEMA.md`** — Preset contract
  (tiers, `requires.variables`, composition rules, naming conventions).
  This is the document that operationally defines what an IDP is, in
  this project.

Earlier ADRs (001 — Scalprum dynamic plugins; 004 — static vs dynamic
plugin split; 009 — configuration profiles; 010 — unified image, preset
catalog, OCI dynamic plugins) are referenced in commit history and in
ADR-011's "Related decisions" section but the corresponding `docs/adr/`
files have not been drafted in this repo yet. The decisions they
represent are observable in the code (the Scalprum integration, the
two-tier static/dynamic split, the unified Dockerfile + preset catalog)
and are summarised functionally throughout this doc set.

## Out of scope for this image

These were deliberate non-decisions in this repo:

- **MCP plugins.** Wired through the `dynamic-plugins.default.yaml`
  with `disabled: true` (mcp-actions-backend, the `*-mcp-extras`
  stack, mcp-chat). They are not part of `recommended`; turning them
  on is a future preset.
- **Letta / Knowledge / other AI extensions.** Not bundled.
- **Customer-specific RBAC.** The shipped `rbac-policy.csv` carries
  only the baseline admin/developer/viewer wiring against
  `examples/org.yaml`. Customer policy is a deploy-time artifact, not a
  preset (`presets/README.md` § "Discipline" — no business logic in
  presets).
- **Tag-driven publishing.** Until there is a real consumer, the
  publish workflow is manual-dispatch only.

## Where to start, by task

- "I want to run this locally with my GitHub org." →
  [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) (presets via
  `scripts/dev-run.sh`) and [`presets/github.yaml`](../presets/github.yaml).
- "I want to add a new dynamic plugin to the image." →
  [`DYNAMIC_PLUGINS_ARCHITECTURE.md`](DYNAMIC_PLUGINS_ARCHITECTURE.md)
  - [`PLUGINS.md`](PLUGINS.md).
- "I want to add a new preset." →
  [`presets/README.md`](../presets/README.md) +
  [`presets/SCHEMA.md`](../presets/SCHEMA.md) +
  [`CONFIGURATION_GUIDE.md`](CONFIGURATION_GUIDE.md).
- "I want to bump Backstage / Node / EXTENSIONS_TAG." →
  [`UPGRADING.md`](UPGRADING.md).
- "I want to publish a release." →
  [`RELEASE_CYCLE.md`](RELEASE_CYCLE.md).
- "I want to scan the published image for CVEs." →
  [`SECURITY_SCAN_AND_FIX.md`](SECURITY_SCAN_AND_FIX.md).

## AI assistant notes

This repo's `CLAUDE.md` carries the live operating rules for AI
assistants (project conventions, branch hygiene, the
test-as-you-go principle). The docs in this folder are the _facts_;
`CLAUDE.md` is the _workflow_. When the two ever drift, treat the
code as the source of truth and update both.
