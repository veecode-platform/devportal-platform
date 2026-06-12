# ADR-010: Unified image, preset catalog, OCI dynamic plugins

## Status

Accepted — 2026-05-14. Foundational decision for this repo; recorded
after the fact because the work shipped during bootstrap (PRs #1–#9,
2026-05-13 → 2026-05-14, with the OCI migration completed in PRs
#12–#14 on 2026-05-15 and the MCP preset in #16 on 2026-05-18).

This ADR is one of the "missing 001–010" gap noted in
[`docs/ROADMAP_BACKLOG.md`](../ROADMAP_BACKLOG.md) § "In documentation"
— the others (001 Scalprum, 003 UBI, 004 static-vs-dynamic, 009
configuration profiles) are inherited functionally from
`veecode-platform/devportal-base`'s ADRs and are observable in this
repo's code, but aren't re-drafted here. ADR-010 is the one that
*needed* to be written here because it is the architectural shift
that defines this repo's existence.

Supersedes ADR-002 (Base vs distro image, in `devportal-base`).
Generalizes ADR-009 (Configuration profiles, in `devportal-base`) —
the profile concept becomes a class of preset. Preserves ADR-001
(Scalprum dynamic plugins), ADR-003 (UBI base — refined by
[ADR-012](./012-anonymous-ubi-mirror.md)), and ADR-004 (static vs
dynamic plugin split).

## Context

`devportal-base` and `devportal-distro` split the product into two
images: `docker.io/veecode/devportal-base` (lightweight runtime, ADR-002
in that repo) and `docker.io/veecode/devportal` (distro extending base
via `FROM veecode/devportal-base:${TAG}` and baking in a dynamic-plugin
set). The split made sense at the time it was made; three things
invalidated it in 2026:

1. **The motivating concern was build time, not differentiation.**
   The split existed because adding a plugin used to require
   rebuilding a single Dockerfile end-to-end. With OCI plugin
   distribution (via the `oci://…` install path inside the runtime),
   a plugin's lifecycle is decoupled from the image's. The plugin
   set is now a set of OCI artifact references the image resolves at
   boot, not a frozen build-time bake. The original problem solves
   itself.

2. **The split costs more than it saves.** Two repos, two CI
   pipelines, cascading builds (`devportal-distro`'s Dockerfile
   starts with `FROM veecode/devportal-base:${TAG}` and rebuilds on
   every base bump), coordinated tag bumps, and version drift across
   `backstage.json` files. Cross-repo coordination tax shows up in
   every feature touching both repos. The distro repo's
   `dynamic-plugins/` host-side workspace duplicated a build the
   plugin-publishing pipeline (`devportal-plugin-export-overlays`)
   was already doing.

3. **RHDH 1.10 already moved the same way.** Red Hat ships a single
   `rhdh-hub-rhel9` image with `dynamic-plugins.default.yaml`
   externalized as a separate OCI artifact (`plugin-catalog-index`).
   The "base + distro" topology stopped being a differentiator once
   the upstream model converged with our former distro.

The strategic insight that fell out of investigating the migration:
the differentiation we want is not at the image-topology layer. It is
at the **curation layer** — how we help operators turn a generic
runtime into a working IDP for their specific stack.

## Decision

Collapse `veecode/devportal-base` + `veecode/devportal` into a single
greenfield image (`docker.io/veecode/devportal-platform`, in this repo)
and introduce **presets** as the canonical curation artifact.

The two legacy repos are not refactored into this — they freeze as the
last stable 1.49 line (security backports only) under
maintenance-indefinite ownership; the new product line starts at
`0.1.0` in `devportal-platform`. Customers who choose to migrate follow
[`docs/UPGRADING_FROM_BASE_DISTRO.md`](../UPGRADING_FROM_BASE_DISTRO.md).
Migration is not forced.

### What changes (the shipped reality, not the POC prediction)

- **One image, one Dockerfile.** [`Dockerfile`](../../Dockerfile)
  builds the yarn workspace and the runtime layer in one multi-stage
  build. No `FROM veecode/devportal-base:…` reference anywhere.
- **One repo.** `veecode-platform/devportal-platform`. The
  `devportal-poc` repo that validated the design was abandoned
  rather than promoted/renamed — the conclusions ported, the cruft
  did not. The previous "promote POC by rename" idea did not happen;
  the greenfield repo was created fresh and the load-bearing code
  was lifted into it. The original repos (`devportal-base`,
  `devportal-distro`) are untouched.
- **Presets.** [`presets/*.yaml`](../../presets/) declare versioned,
  composable contracts: which plugins this stack uses, which env
  vars are required, what app-config those plugins need. Presets are
  the product's curation surface. See
  [`presets/README.md`](../../presets/README.md) and
  [`presets/SCHEMA.md`](../../presets/SCHEMA.md). 12 presets ship as
  of 2026-05-18 (recommended, veecode-theme, github, gitlab, azure,
  keycloak, ldap, jenkins, kubernetes, sonarqube, mcp, mcp-chat) —
  larger than the ~6-preset cap the design originally floated; the
  practical line we now hold is "no business logic in a preset" plus
  the tier admission tests below, not a numeric cap.
- **OCI for the optional plugin set.** Optional plugins are
  referenced as `oci://${PLUGIN_REGISTRY}/<workspace>:bs_${BACKSTAGE_VERSION}!<selector>`
  in [`dynamic-plugins.default.yaml`](../../dynamic-plugins.default.yaml).
  [`docker/install-dynamic-plugins.py`](../../docker/install-dynamic-plugins.py)
  pulls each bundle via `skopeo` at boot. Six always-on chrome
  plugins (homepage, global-header, about, about-backend,
  dynamic-plugins-info, catalog-backend-module-extensions) are baked into
  the image as npm-published packages — they live under
  `preInstalled: true` with no `disabled:` field;
  `dynamic-plugins-store/` is materialized into `/app/dynamic-plugins-root/`
  at build time. One more entry
  (`red-hat-developer-hub-backstage-plugin-extensions`) is also pre-installed
  but ships `disabled: true`; it is kept as a reference and never enabled
  (the disable is effective because frontend plugins need the
  install-script's pluginConfig merge to surface via scalprum, and `disabled:`
  skips that merge). Backend modules are different: a
  `preInstalled: true + disabled: true` backend module is effectively
  always-on because the backend's feature loader picks up its bytes
  regardless of the disabled flag — `catalog-backend-module-extensions` is
  documented as always-on for that reason. The image itself stays generic;
  the plugin set is data, not code.

### What stays

- **Static vs dynamic split (ADR-004).** Core plugins (auth, catalog,
  scaffolder, RBAC, search, techdocs, kubernetes) remain compiled
  into the backend bundle ([`packages/backend/src/index.ts`](../../packages/backend/src/index.ts)).
  Optional and integration plugins remain dynamic.
- **Scalprum / RHDH dynamic frontend (ADR-001).** The frontend uses
  the same Module Federation runtime through the RHDH-derived
  `DynamicRoot` shell. New Frontend System adoption is a separate
  trilha (see [ADR-011](./011-frontend-design-system.md) § Phase 2).
- **Configuration profiles (ADR-009) generalize into presets.** An
  auth-only profile is one species of preset. The legacy
  `app-config.<profile>.yaml` files don't live in this repo —
  operators on the legacy model migrate per
  [`UPGRADING_FROM_BASE_DISTRO.md`](../UPGRADING_FROM_BASE_DISTRO.md).
- **UBI10 Node base image (ADR-003).** Same runtime base; the only
  change is which registry we pull it from
  ([ADR-012](./012-anonymous-ubi-mirror.md)).

## What this repo concretely ships

| Surface | Reality |
|---|---|
| Image | `docker.io/veecode/devportal-platform:<semver>` (e.g. `0.1.0`, `latest`) |
| Image tag scheme | Plain semver from `package.json` `version`; multi-arch `linux/amd64` + `linux/arm64` manifest. No `bs_<bsver>__<distver>` compound tags. |
| Publish | Manual `workflow_dispatch` on [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml). Tag-driven publish exists commented-out; flips on when there's a real consumer. |
| Plugin inventory | [`dynamic-plugins.default.yaml`](../../dynamic-plugins.default.yaml) ships with all optional plugins `disabled: true`. Core-tier (homepage, global-header, about, about-backend, dynamic-plugins-info) ships `preInstalled: true` with no `disabled:` field, so default-on. |
| Preset selector | `VEECODE_PRESETS=<csv>` env var, resolved at boot by [`entrypoint.sh`](../../entrypoint.sh):168-225 (preset resolver loop + `requires.variables` validation). Empty/unset → barebones (core only). |
| Preset format | YAML per [`presets/SCHEMA.md`](../../presets/SCHEMA.md). Flat — no `extends:`; composition is the env-var list. Per-preset `requires.variables` validated at boot, missing vars fail with exit 78. |
| OCI registry indirection | `${PLUGIN_REGISTRY}` env var (default `quay.io/veecode`) is substituted into every plugin OCI ref by `entrypoint.sh`:294-303 (`PLUGIN_REGISTRY` substitution block) — operators with internal mirrors set `PLUGIN_REGISTRY=registry.internal/veecode` and don't touch YAML. |
| Backstage version substitution | `${BACKSTAGE_VERSION}` (default read from [`backstage.json`](../../backstage.json), env-overridable) is substituted into plugin OCI tags by `entrypoint.sh`:272-291 (`BACKSTAGE_VERSION` substitution block). A Backstage bump doesn't mean editing every preset. |
| `dynamic-plugins.default.yaml` lifecycle | **Kept as the plugin inventory** — it didn't dissolve into presets as the POC speculated. Presets carry `{package, disabled: false}` entries whose `package:` strings match the default's entries verbatim, and `install-dynamic-plugins.py` merges shallow per-key (so the `pluginConfig` from the default — mountPoints, dynamicRoutes, RBAC scope — survives a preset enabling the plugin). |

The shadow file trick (`dynamic-plugins.default.resolved.yaml`,
`entrypoint.sh`:141 (`DP_YAML_SHADOW`) + :267 (`DEFAULT_DPD_SHADOW`)) handles the case where the default is
bind-mounted read-only in dev / kubernetes contexts; without it the
in-place `sed` substitutions silently fail and preset/default `package:`
strings stop matching. Documented in
[`ROADMAP_BACKLOG.md`](../ROADMAP_BACKLOG.md) § "`dynamic-plugins.yaml`
is rewritten in place".

## Preset tiers and the curation boundary

Not everything is a preset. The plugin set splits into three tiers, and
deciding which tier a plugin belongs in is the core curation decision.
This is summarised here because it is load-bearing for the ADR's
argument; the operator-facing version lives in
[`presets/README.md`](../../presets/README.md) § "Tiers".

1. **Core** — always enabled, not gated by any preset, baked into the
   image. The plugins without which the app is not a coherent
   product: the global header (app chrome — search, notifications,
   profile), the homepage (something has to answer `/`), the About
   page + its backend, the dynamic-plugins-info page. Test: *the app
   is not usable without it, **and** it needs nothing configured to
   work.*

2. **`recommended`** — the preset that makes a generic image read as
   "a DevPortal" rather than "a Backstage skeleton": the marketplace
   (devportal-marketplace front/back + the RHDH
   `catalog-backend-module-extensions` that ingests the catalog
   index), pending-changes, tech-radar (sample data, marked as a
   sample), RBAC (UI mounted, enforcement keyed on `permission.enabled`
   which already defaults true; RBAC kicks in when the operator
   provides a policy). Admission rule: *only plugins that work with
   zero configuration*. A plugin that loads but renders empty or
   broken without config does not belong here.

3. **Integration presets** (`github`, `azure`, `gitlab`, `keycloak`,
   `ldap`, `jenkins`, `kubernetes`, `sonarqube`, plus `mcp` /
   `mcp-chat` and the brand preset `veecode-theme`) — SCM, identity,
   and infrastructure integrations. These *require* customer-specific
   configuration (tokens, realms, org names, control-plane URLs) and
   therefore carry `requires.variables`. The two exceptions are
   `veecode-theme` (no required vars — it's brand, not integration)
   and `mcp` (no required vars — the OAuth/DCR config is already in
   the platform's baseline `app-config.production.yaml`).

The line between tiers is the same line that separates "ships in the
box" from "implementation work":

- **`requires.variables` is the boundary.** A preset that declares
  required variables is saying: from here on, the configuration is
  customer-specific. The preset *names* what is needed and *points at
  the documentation*, but it does not, and must not, fill it in. An
  integration preset is in effect an engagement scaffold: it makes the
  shape and scope of an integration legible (here is what a GitHub
  integration looks like; here are the values you must decide and
  provide) without doing the integration. This is deliberate — it
  keeps the preset boundary aligned with the services boundary, and
  it is honest design: required configuration is surfaced up front
  instead of discovered as a 401 in production.

- **No business logic in presets.** A preset is configuration, not
  policy. It must not ship an opinionated RBAC policy CSV, catalog
  rules that assume a particular org structure, or scaffolder
  templates — those are per-customer implementation artifacts and
  belong in that customer's deployment, not in the shipped catalog.
  The schema already enforces this (`appConfig` is pure
  configuration, not a runtime hook); the tiering makes the reason
  explicit. Sample data — a starter tech-radar, clearly marked as a
  sample to be replaced — is not business logic and is allowed.

- **`recommended` looks polished with zero config and does nothing
  real without it.** Chrome works, the homepage renders, the
  marketplace is browsable, About shows the version. The moment the
  operator wants the IDP to integrate a repo, enforce permissions,
  or run a template, they hit a `requires.variables` wall that names
  what is missing and points at the docs.

In one line: **a preset carries the configuration that is the same for
everyone and stops at the configuration that is specific to one
customer — it is a map of the work, not the work done.**

## Distribution modes

OCI runtime download is the default. Two alternative modes are
supported by design, not by accident:

| Mode | When | How |
|---|---|---|
| **Default (runtime OCI)** | Cloud, SaaS, environments with registry access | Image pulls plugin bundles via `oci://` at boot through `install-dynamic-plugins.py` |
| **Mirror** | Customer with internal registry, no public internet | `PLUGIN_REGISTRY=registry.internal/veecode` env var; the entrypoint substitutes it into every OCI ref before the install runs |
| **Loaded variant** | Air-gapped, regulated environments | Customer builds their own image `FROM veecode/devportal-platform:<tag>` and pre-extracts selected plugins into `/app/dynamic-plugins-root/` at build time |

The "loaded variant" replaces the legitimate use case the previous
distro served (curated bundle pre-baked). The published image stays
generic; customers who need air-gapped operation produce their own
loaded image. We don't maintain a catalog of pre-baked image variants.

## Plugin release contract

A `devportal-platform` image release pins a **Backstage version**
(`backstage.json`) and a **plugin set** (the entries in
`dynamic-plugins.default.yaml`). Most plugin OCI tags are
Backstage-version-scoped through the `${BACKSTAGE_VERSION}`
substitution:

```yaml
- package: oci://${PLUGIN_REGISTRY}/marketplace:bs_${BACKSTAGE_VERSION}!devportal-marketplace-frontend-dynamic
```

A handful of plugin entries pin a literal `bs_1.49.4` (or
`bs_1.48.4` for the few plugins whose 1.49 build hasn't been
re-published yet) because the substitution model trades a bit of
precision for ergonomics: when Backstage bumps, all the literal pins
update by hand once the upstream OCI tag is published; the
`${BACKSTAGE_VERSION}` entries pick up the new version
automatically. The cleanup expectation is documented in
[`docs/UPGRADING.md`](../UPGRADING.md) § Track 1.

**What the POC's "moving `bs_<bsver>__latest` tags + pullPolicy:Always"
model is not.** The POC ADR described a moving tag whose plugin
content updates on every container restart. That is not what shipped;
the current model uses immutable pinned tags. Moving-tag distribution
remains a possible future refinement (it lets a plugin patch land in a
running fleet without an image bump), but it isn't implemented today
and isn't on the near-term roadmap. The shipped model favours image
reproducibility (a given image tag always loads the exact same plugin
bytes) over rolling-update convenience.


## Configuration ownership model

The image has **two operator-writable surfaces** for runtime behavior:

1. **`dynamic-plugins.yaml`** (top-level `plugins:` list) — adds or overrides
   plugin enablements beyond what presets do. The `includes:` key is internal,
   assembled by the entrypoint on every boot from the catalog plus per-preset
   fragments. Post-PR #33 (commit fff52e5), `includes:` is not an operator
   surface; the entrypoint generates it, and operators must not edit it.

2. **`app-config.local.yaml`** (or `VEECODE_APP_CONFIG` base64 env) — layered
   after preset `appConfig` per the file precedence chain in `entrypoint.sh`.

The image also has **internal artifacts the operator must not edit**:

- The assembled `includes:` chain inside `dynamic-plugins.yaml`.
- **`dynamic-plugins.default.yaml`** — the catalog (see
  [ADR-013](./013-plugin-catalog-model.md)). Editing it changes what is
  *available*, not what is *enabled*; no operator effect without a
  corresponding selection-surface change.

**Two volume mounts complete the contract:**

- **`/app/data`** — operator-owned **state** (SQLite per-plugin DBs,
  `extensions-install.yaml` from marketplace UI selections). **Must be a
  directory mount.** Single-file bind mounts break atomic file rewrites
  and introduce silent failures in the install logic.

- **`/app/dynamic-plugins-root`** — **bundle cache**. Persisting across
  restarts amortizes the download cost on subsequent boots.

This ownership model reflects a deliberate persona split: the
**platform-installer** iterating on plugin choices needs `dynamic-plugins.yaml`
to be **the** selection surface, with `includes:` invisible and managed by the
entrypoint. The **product-operator** running production reads the same file but
typically delegates plugin selection to a preset, treating `dynamic-plugins.yaml`
as a read-only reference or an optional per-deployment override surface.

Volume mount specifications and examples are documented in
[`examples/deploy/docker-compose.yml`](../../examples/deploy/docker-compose.yml)
and [`examples/deploy/k8s.yaml`](../../examples/deploy/k8s.yaml).


## Consequences

### Benefits

- One repo, one CI, one release — no more cascading bumps or
  `backstage.json` drift across repos.
- Plugin and product release schedules decouple. Adding an optional
  plugin to the inventory or shipping a new preset doesn't require
  rebuilding plugin bundles.
- Onboarding cost drops. A new contributor reads one
  `CLAUDE.md`, one `Dockerfile`, one `entrypoint.sh`. The mental
  model collapses to "image + presets + OCI artifacts".
- Required configuration becomes visible upfront. Operators see
  what their stack needs before the IDP starts handing out 401s.
- Differentiation moves to a defensible layer. Curation is real
  work that outlives image-topology choices.

### Costs

- **Runtime registry dependency.** Boot now depends on registry
  reachability for non-bundled plugins. Mitigated by the mirror
  mode and the loaded-variant escape hatch.
- **Slightly slower first boot.** Plugin downloads happen at
  startup. Mitigated by the image's own filesystem cache being warm
  on subsequent boots and by skopeo's parallelism in
  `install-dynamic-plugins.py`.
- **Migration work for legacy customers.** Operators on `veecode/devportal-base`
  + `veecode/devportal` must move config from
  `VEECODE_PROFILE=<x>` to `VEECODE_PRESETS=…` and acknowledge
  that the new preset surface intentionally narrows what an
  integration preset does (an SCM preset wires the SCM, not the SSO
  for that SCM). The migration guide carries the per-profile
  detail.
- **The cbme stopgap.** The Dockerfile applies a `sed` patch to
  `catalog-backend-module-extensions` so its `/alpha` import for
  `catalogProcessingExtensionPoint` falls back to the main export.
  Needed because the upstream `bs_1.49.4` build references the
  alpha symbol; on a 1.49.4 backend the alpha export does not
  carry the symbol either (it graduated in 1.48). Cleanup is
  documented in
  [`docs/UPGRADING.md`](../UPGRADING.md) § Track 3 and stays until
  `quay.io/veecode/extensions:bs_1.50.0` (or any tag whose build
  imports from the main export) is published.

  _Update (2026-06): the per-module `sed` was replaced by a single
  catalog-node `/alpha` compat shim appended to `node_modules`
  (re-exports graduated symbols on `/alpha`), which also covers
  runtime-loaded plugins (e.g. immobiliarelabs gitlab), not just the
  baked cbme module. Mechanism changed; the rationale below stands._

### Risks

- **Preset proliferation.** If we accept too many presets, the
  curation surface dilutes. Mitigation: the tier admission tests
  above plus "no business logic" are the discipline, not a numeric
  cap. The current 12 are all defensible (10 integration + brand
  + recommended); if a 13th preset tempts us, the question is "what
  is the same for everyone here and what is customer-specific?"
- **Hidden coupling between presets.** A preset that implicitly
  depends on another reintroduces ADR-002's coupling at the YAML
  layer. The schema does not enforce "preset A requires preset B"
  declaratively; today the only such pair is `mcp-chat` →
  `mcp` (loopback to `localhost:7007/api/mcp-actions/v1`),
  documented loudly in `presets/mcp-chat.yaml` and in
  [`presets/README.md`](../../presets/README.md). If a second such
  pair appears, the right move is to add `requires.presets:` to the
  schema, not let the convention multiply.
- **Bind-mount foot-gun on `dynamic-plugins.default.yaml`.** Fixed
  by the shadow-file approach in `entrypoint.sh`:141 + :267 (the two `*_SHADOW` assignments).
  Captured here because re-architecting the resolver to write a
  separate runtime file (instead of editing in place) would
  eliminate the class of bug entirely; that refactor is in
  [`ROADMAP_BACKLOG.md`](../ROADMAP_BACKLOG.md).

## Validation

A boot smoke harness lives at
[`scripts/smoke-presets.sh`](../../scripts/smoke-presets.sh) and is
wired to a manual-dispatch workflow at
[`.github/workflows/smoke-presets.yml`](../../.github/workflows/smoke-presets.yml)
— run by an operator against a published image tag after a Publish,
before the tag is announced as available. For each preset (or
composition) in its default test matrix, it starts a container with
dummy values for the preset's `requires.variables`, waits for
`/healthcheck`, hits `/api/dynamic-plugins-info/loaded-plugins`, and
asserts the plugin count. Dummy creds pass boot validation but don't
reach real services — the gate is "preset config valid + backend
boots + plugins register", not end-to-end integration.

Coverage today (`scripts/smoke-presets.sh` § `ALL_TESTS`): every
single-preset boot (`recommended`, `veecode-theme`, `github`,
`gitlab`, `azure`, `keycloak`, `ldap`, `jenkins`, `kubernetes`,
`sonarqube`, `mcp`) plus `recommended,mcp` and
`recommended,mcp,mcp-chat`.

The architectural decisions in this ADR are considered validated by:

1. **The image builds end-to-end** — `docker build .` with
   `--memory=4g --memory-swap=6g` on a constrained host (WSL). Run
   by an engineer locally or by the publish workflow on dispatch;
   the PR check
   ([`.github/workflows/pr-check.yml`](../../.github/workflows/pr-check.yml))
   runs tsc/lint/test only — Dockerfile-only breakage surfaces at
   publish time, captured as a follow-up in
   [`ROADMAP_BACKLOG.md`](../ROADMAP_BACKLOG.md) § "PR check doesn't
   build the image".
2. **`VEECODE_PRESETS=recommended` boots cleanly** with marketplace,
   tech-radar, RBAC UI, and pending-changes wired (smoke matrix).
3. **`VEECODE_PRESETS=recommended,veecode-theme`** adds the
   VeeCode brand identity end-to-end — verified per the criteria
   captured in [ADR-011 § "Validation criteria"](./011-frontend-design-system.md).
4. **`VEECODE_PRESETS=<integration>`** with dummy required vars
   boots and registers the integration's plugins (smoke matrix
   covers each integration in isolation).
5. **Omitting a required variable** fails the boot with exit 78 and
   a preset-aware error message (`entrypoint.sh`:186-215, the `requires.variables` loop with exit-78; the
   smoke harness disambiguates timeout-from-missing-vars from a real
   boot hang, so a regression in the fail-fast path would surface).

Failure modes the harness does **not** cover today: the
empty-`VEECODE_PRESETS` barebones-boot path (image core + no preset),
intentional missing-required-var assertions (the harness sets dummy
values so the boot passes), and end-to-end plugin-behavior validation
(the gate is "the backend registers the plugin", not "the plugin's
UI works against a real provider"). The first two are mechanical
additions to the matrix; the third belongs in a separate
end-to-end harness, outside the scope this ADR carves.

## Promotion path and the legacy line

The legacy `devportal-base` + `devportal-distro` repos were not
refactored, and they were not absorbed into this repo. They freeze on
their `1.3.x` line (Backstage 1.49.4) under maintenance-indefinite
ownership — security backports only, until the 1.49 baseline reaches
the end of upstream Backstage's CVE-backport window
(~2026-09 per Backstage policy at the time of writing) or until a
real consumer signals migration, whichever comes first. ADR-002's
two-image topology retires with them.

The customer migration path lives in
[`docs/UPGRADING_FROM_BASE_DISTRO.md`](../UPGRADING_FROM_BASE_DISTRO.md).
The platform does not auto-translate `VEECODE_PROFILE=<x>` into the
equivalent `VEECODE_PRESETS` — the migration is documented, not
code-supported, because the per-integration preset's contract is
intentionally narrower than the corresponding profile and rebuilding
a 1:1 shim would hide that.

## Migration deferral — Backstage 1.50 bump postponed

Pinned at **1.49.4** ([`backstage.json`](../../backstage.json)). The
1.50 bump was completed and validated end-to-end in
`devportal-poc` then reverted on 2026-05-13 ahead of the greenfield
bootstrap. The deferral carries here; not because of anything in
this repo, but because of the ecosystem distance — RHDH product is
on Backstage 1.45.3 with no public signal of moving to 1.50, and our
core dynamic-plugin surface (homepage, global-header, MCP) lives in
that ecosystem.

A complication discovered during the 1.50 retreat: the
`/alpha` → main graduation of `catalogProcessingExtensionPoint`
happened in Backstage **1.48**, not 1.50
(`@backstage/plugin-catalog-node@2.2.0` — the one in our 1.49.4 line
— has the symbol in the main export only). So the cbme `bs_1.49.4`
OCI build imports from `/alpha` and is incompatible at both the
1.49.4 and the 1.50.0 backend. The Dockerfile / `dev-run.sh` sed
patch (the cbme stopgap) is therefore **needed regardless of being
on 1.49.4 or 1.50.0**; it stays until `quay.io/veecode/extensions`
publishes a build whose cbme module imports from the main
`@backstage/plugin-catalog-node` export.

The bump becomes attractive again when: **(a)**
`quay.io/veecode/extensions` publishes that fixed cbme build
(drops the stopgap), **and** **(b)** the upstream RHDH 1.10/1.11
line lands with a Backstage 1.50 baseline (drops the ecosystem
distance). Until then, 1.49.4 stays as the baseline and absorbs
backported CVE fixes from Backstage 1.49.x patch releases.

Tracked in [`docs/ROADMAP_FEATURES.md`](../ROADMAP_FEATURES.md) §
"Mid term — Backstage 1.50 migration" and in the cleanup track of
[`docs/UPGRADING.md`](../UPGRADING.md) § Track 3.

## Related decisions

- **In this repo:**
  - [ADR-011](./011-frontend-design-system.md) — Frontend design
    system. The VeeCode theme ships through the preset model, as
    its own preset (`veecode-theme.yaml`) composed alongside
    `recommended`, not folded into it. The same dynamic-plugin
    mechanism a customer would use to skin the IDP for their own
    brand.
  - [ADR-012](./012-anonymous-ubi-mirror.md) — Pull UBI from the
    anonymous mirror so build needs no Red Hat credentials.
- **In `devportal-base` (inherited as functional context, not
  re-drafted here):**
  - ADR-001 — Scalprum dynamic plugins (preserved).
  - ADR-002 — Base vs distro image (superseded by this ADR).
  - ADR-003 — UBI10 Node base image (preserved, refined by
    ADR-012).
  - ADR-004 — Static vs dynamic plugin split (preserved).
  - ADR-009 — Configuration profiles (generalized into presets).

## References

- [`presets/README.md`](../../presets/README.md) — operator-facing
  preset catalog (tiers, composition, the curation discipline).
- [`presets/SCHEMA.md`](../../presets/SCHEMA.md) — preset format
  specification.
- [`docs/README.md`](../README.md) — entry point for the
  concept-first docs IA (what this image is, two paths of use, where
  to start by task).
- [`docs/UPGRADING_FROM_BASE_DISTRO.md`](../UPGRADING_FROM_BASE_DISTRO.md)
  — customer migration guide (the operator-facing companion to this
  ADR).
- [`docs/ROADMAP_BACKLOG.md`](../ROADMAP_BACKLOG.md) — known
  follow-ups including the missing-ADR list and the
  `dynamic-plugins.default.yaml` rewrite-in-place foot-gun.
- POC repository: `veecode-platform/devportal-poc` (abandoned
  branch, kept as archaeology for design rationale).

## Update history

The body of this ADR is point-in-time as of acceptance (2026-05-14).
The architectural decisions themselves stand. The list below tracks
post-acceptance changes that affect the *numbers* and *details* in
the body — append-only; the body is not rewritten.

- **2026-05-25 — Catalog index baked at build time** (commit
  `6cb820d`). The Dockerfile now extracts the marketplace catalog
  into `/app/catalog-entities/extensions/` at image build time. The
  runtime download path in `entrypoint.sh` is preserved as an
  opt-in (`CATALOG_INDEX_REFRESH=true`); default cold boot no longer
  hits the network for the catalog. Affects § "Costs" — the
  "slightly slower first boot" claim is now bounded by OCI plugin
  fetches only, not catalog fetches. Cross-doc impact: ADR-013 § 30
  ("pulled by the Marketplace plugin at runtime") is no longer the
  default path.

- **2026-05-25/26 — Install-script hard-fail** (commit `649e2c8`).
  `install-dynamic-plugins.py` now collects per-plugin install
  failures, prints an install summary, and exits 78. The
  `DYNAMIC_PLUGINS_TOLERATE_FAILURES=true` opt-out preserves the
  pre-fix behavior for dev iteration. Affects § Consequences — the
  partial-half-installed-portal failure mode is now closed by
  default. Documented in `docs/topics/installing.md` § "Exit 78 —
  plugin install failure" and `docs/reference/env-vars.md`.

- **2026-05-26 — Always-on chrome count corrected** (commit
  `5da6334`). `red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions`
  was documented as "gated by the `recommended` preset" but the
  install-script's `disabled:` check only skips install + pluginConfig
  merge — for `preInstalled: true` backend modules, the bytes are
  already in `/app/dynamic-plugins-root/` from build time and the
  backend feature loader picks them up regardless of `disabled:`.
  The plugin was effectively always-on; the metadata + docs now
  reflect that. The § "What this repo concretely ships" table row
  for the Core-tier (line 149) lists 5 plugins; the actual chrome
  set is 6 (add `catalog-backend-module-extensions`). Cross-doc:
  `docs/topics/dynamic-plugins.md`, `docs/PLUGINS.md`,
  `docs/CONFIGURATION_GUIDE.md`, and `docs/BACKSTAGE_ARCHITECTURE.md`
  were updated in the same commit.

- **Preset count drift.** Body says "12 presets as of 2026-05-18".
  Today (2026-05-26): **15** — added `github-auth`, `azure-auth`,
  `ldap-ad` after acceptance (SCM/identity split formalized in
  `UPGRADING_FROM_BASE_DISTRO.md`). The Risks parenthetical
  ("10 integration + brand + recommended") becomes "13 integration
  + brand + recommended". The "12 are all defensible" framing
  generalizes — the discipline is the curation boundary, not a
  numeric cap (already noted in the body line 99).

- **Smoke harness coverage growth.** Body § Validation lines
  411-415 enumerate the 2026-05-18 ALL_TESTS matrix. Current
  coverage is a strict superset: also covers `github-auth`,
  `github,github-auth`, `azure-auth`, `azure,azure-auth`,
  `ldap,ldap-ad`, plus a `+mount` regression variant exercising
  the bind-mounted operator overlay. No regression in coverage —
  the body just lists the older matrix.

- **Line-citation drift.** All `entrypoint.sh` line references in
  the body were updated 2026-05-26 to match the current 407-line
  file. Future drift on these specific lines is expected; prefer
  greping for the named section (e.g. `# ── Resolve ${PLUGIN_REGISTRY}`)
  over trusting the cited range.
