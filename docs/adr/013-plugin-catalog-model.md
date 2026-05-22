# ADR-013 — Plugin catalog model: *vitrine*, selection surfaces, and the deferred unification

**Status:** Accepted (with deferred execution)  
**Date:** 2026-05-22  
**Related:** [ADR-010](./010-unified-image-and-presets.md), [ADR-011](./011-frontend-design-system.md)

## Context

The repository currently maintains two independent artifacts that function as plugin catalogs, creating a fundamental architectural incoherence and operator confusion at the critical decision point: "Where do I add a plugin?"

### The two catalogs in detail

**1. `dynamic-plugins.default.yaml`** (in-repo, ~33 entries, hand-maintained)
- **Role:** Drives boot-time plugin installation via `install-dynamic-plugins.py`, invoked from `entrypoint.sh` (lines 43–72).
- **Entries with local bundles** (`dynamicArtifact: ./`):
  - 7 preInstalled core plugins: homepage, global-header, about-backend, about-frontend, dynamic-plugins-info, RHDH extensions (2 entries)
  - These are packaged inside the container image; no external fetch required.
  - Represent the minimal viable set of UI and backend capabilities.
- **Entries with OCI references** (`oci://` registry URLs):
  - ~26 external plugin bundles: marketplace (front/back/pending-changes), kubernetes, security-insights, github-insights, azure-devops (front/back), jenkins (front/back), sonarqube (front/back), rbac, tech-radar (front/back), mcp-actions-backend, mcp-tools (multiple variants), mcp-chat (front/back), veecode-theme.
  - Most marked `disabled: true`, indicating incomplete cleanup or deferred deprecation.
  - Each OCI entry references a specific bundle image tag (e.g., `quay.io/veecode/plugin-marketplace-backend:1.0.0`).
- **Update mechanism:** Manual YAML edits committed to git. Each plugin addition requires understanding the correct YAML structure and dependencies.

**2. `plugin-catalog-index`** (OCI image at quay.io/veecode/plugin-catalog-index, ~125 `Package` + 87 `Plugin` + 7 `Collection` Backstage entities)
- **Role:** Drives the marketplace UI (`/extensions/marketplace`) inside the portal. Consumed by the Marketplace backend plugin at runtime.
- **Source:** Built by the `devportal-plugin-export-overlays` fork (external repo, separate maintenance).
- **Update schedule:** Decoupled from the main distro release cycle.
- **Content:** Rich metadata beyond `default.yaml` — plugin descriptions, category taxonomy, icons, install instructions, documentation links.
- **Delivery:** Published to quay.io; pulled by the Marketplace plugin at runtime using skopeo (see `entrypoint.sh` lines 43–72).
- **Operator visibility:** End-users see the index contents in the portal UI, making it the primary source of plugin discoverability for self-serve scenarios.

### The problem: split, independent, incoherent

Both artifacts present plugin offerings to operators but serve different consumers and are maintained independently:

| Aspect | Boot (default.yaml) | Marketplace (catalog-index) |
|--------|-----|-----|
| Consumer | Entrypoint script | Marketplace UI |
| Location | In-repo | External image |
| Update mechanism | Manual commit | External build/push |
| Update frequency | Per distro release | Independent |
| Semantics | "preInstalled or available for selection" | "discoverable in UI" |

**The confusion point:** When an operator wants to make a plugin available, the answer is not obvious:
- To boot with the plugin: edit `dynamic-plugins.default.yaml` + commit.
- To make it visible in marketplace: commit to `plugin-catalog-index` repo (external, possibly lower permissions).
- Most operator intentions require **both** edits, but the two paths are uncoordinated and have different latencies (distro release vs. index update).

**Drift example:** A plugin in `plugin-catalog-index` but disabled in `default.yaml` (marked `disabled: true`) appears as discoverable in the marketplace but cannot be selected, confusing operators who find it in the UI and try to use it.

Related work (ADR-010, PR #33) clarified the *selection* model: presets, operator override (`dynamic-plugins.yaml`), and marketplace UI are three distinct ways to **select** which entries are enabled. But the *catalog itself* — the authoritative list of "what is available" — remains split between two repos and two release schedules.

## Decision

Adopt a **conceptual vocabulary and model** to structure how plugins are offered and selected, separating the catalog from the selection mechanisms:

### The three-part model

**1. One *vitrine*** (*vitrines* or "showcase" in Portuguese; a metaphor for a catalog or display window)
- The **authoritative collection of available plugins**, describing what *can* be selected.
- Answers the question: "What plugins exist?"
- Selection itself (which subset is enabled) is a separate, orthogonal concern.
- **Ideal state:** A single, unified source of truth, most likely derived from `plugin-catalog-index`.
- **Current state:** Split between `default.yaml` and `plugin-catalog-index`, each maintained independently.
- **Characteristics of a good *vitrine*:**
  - Comprehensive metadata (name, category, icon, install instructions).
  - Disambiguates between preInstalled (bundled) and external (OCI) plugins.
  - Single source of truth for auditing and discovery.
  - Updated alongside the distro, preventing drift.

**2. Three *selection surfaces*** (independent, operator-facing ways to choose enabled plugins)
- **Preset (`VEECODE_PRESETS` env var or config mount):** Declarative bundles of plugin selections, composed at boot via the preset resolver (see ADR-010 § Preset model). Recommended for most operators.
- **Operator override (`plugins:` list in `dynamic-plugins.yaml`):** Fine-grained per-deployment config, mounted as a volume. Merged last in the includes chain, giving it highest precedence. Used for platform-installer personas iterating on plugin choices.
- **Marketplace UI (`/extensions/marketplace`):** Interactive, end-user-facing install/uninstall. Requires the `recommended` preset (which enables the Marketplace backend and frontend plugins). Persisted to `/app/data/extensions-install.yaml`; survives restart.

**Selection rule:** A plugin is **enabled** if *any* selection surface includes it (OR logic). A plugin is **disabled** if explicitly disabled in `dynamic-plugins.yaml` or if no surface selects it.

**3. One *resolver*** (boot-time entrypoint logic that composes catalog + selections)
- **Responsibility:** Reads the *vitrine*, evaluates all three selection surfaces, and produces the final plugin install map passed to Backstage.
- **Current implementation:** Spread across `entrypoint.sh`:
  - Lines 43–72: Download `plugin-catalog-index` via skopeo and expand it as YAML.
  - Lines 83–160: Preset resolver that reads presets, validates `requires.variables`, and assembles the preset-driven selections.
  - Lines 192–203: Build the includes chain by concatenating presets, `dynamic-plugins.default.yaml`, and operator overrides (`dynamic-plugins.yaml` `plugins:` list).
  - Lines 220–274: Template substitution for `${BACKSTAGE_VERSION}` and `${PLUGIN_REGISTRY}` to parameterize plugin references across the catalog.
- **Design principle:** The *resolver* treats the *vitrine* as **read-only** and is responsible for applying the composition and precedence rules. This ensures that editing the catalog has zero effect on the image's architecture.

### The current vs. target state

**Current state:** The *vitrine* is **logically split** across two unrelated repos and release schedules. Operators cannot answer "where is the source of truth for what plugins exist?" without consulting both.

**Target end-state:** A single *vitrine*, most likely derived from or entirely replaced by `plugin-catalog-index`. The hand-maintained `dynamic-plugins.default.yaml` would either be removed or be a generated artifact (produced at build via Forma B, or at boot via Forma A).

**The decision being made:** **Unification is accepted in principle but execution is deferred.** This ADR documents the conceptual model and the deferral decision, pending a dedicated owner and resolution of the constraints listed below.

**Why defer?** The unification decision depends on resolving version-lockstep, preInstalled plugins, and audit findings — all out of scope for the current sprint.

## Alternatives considered for unification

Three approaches were evaluated for when and how to converge to a single vitrine:

### Forma A — Derive from registry at boot

**Mechanism:** Entrypoint script fetches `plugin-catalog-index` at container startup (already done for the marketplace; extend this for boot selections), generates the `dynamic-plugins.yaml` includes chain in memory before starting Backstage.

**Advantages:**
- The *vitrine* is always fresh relative to the upstream index; no embedded or stale data.
- No commit-time or build-time generation step; simpler CI pipeline.
- Single artifact (the index) to maintain; `default.yaml` becomes generated.
- Easy rollback: old image still has fallback logic if the index is unavailable.
- Avoids version-lockstep coordination between image and index tags.

**Disadvantages:**
- Boot latency increases due to network fetch, parsing, and index fetch retry logic.
- New failure mode: if the index is unreachable, boot has no fallback defaults → pod crash loop. Requires a cached fallback copy in the image.
- Offline / air-gapped cluster scenarios become impossible without pre-population.
- Audit trail becomes opaque: "what was installed in that image?" requires examining boot-time logs, not static artifacts.
- Network I/O makes boot timing non-deterministic; harder to predict startup latency.
- Race condition risk: if the index is fetched at boot, simultaneous boots of the same image version could see different plugin catalogs.

### Forma B — Derive at build/CI

**Mechanism:** CI pipeline pulls `plugin-catalog-index`, materializes `dynamic-plugins.default.yaml` as a CI artifact, commits the generated file to the repo or embeds it in the OCI image. Image release is gated on successful generation.

**Advantages:**
- Boot remains simple and fast; no runtime network dependency or latency.
- Image is deterministic per tag: `devportal:0.2.0` always contains the same canonical `default.yaml`.
- Audit trail is explicit (git log shows when the catalog changed and from which index tag).
- Easier to test: catalog is static during smoke tests and validation.
- Avoids boot-time failures due to index unavailability.

**Disadvantages:**
- Requires **version-lockstep coordination** between Backstage host image version (`bs_0.2.0`) and `plugin-catalog-index` tag. This is a **process coupling**, not a one-time task. Question: Who owns this sync? Who publishes the index when the distro releases?
- `dynamicArtifact: ./` entries in the current `default.yaml` (~7 preInstalled plugins) have no OCI equivalents in the index (which only catalogs external bundles). Unification must decide: (a) keep them outside, (b) OCI-export them, or (c) remove them entirely. Non-trivial migration.
- New CI failure mode: if the index is unavailable during build, the release is blocked.
- Risk of skew: if the index is published but the distro release is delayed, the image and index become out-of-sync, confusing operators.
- Requires changing the build pipeline and gitOps workflow (if currently using git-as-source-of-truth).

### Forma C — Status quo (the decision being enacted)

**Mechanism:** Maintain both `dynamic-plugins.default.yaml` and `plugin-catalog-index` independently. Document the split clearly for operators. Ship a guard-rail (duplicate-plugin detector from PR #32) to catch the worst error scenario.

**Advantages:**
- Ships today without architectural changes or new process dependencies.
- Avoids version-lockstep coordination and process coupling between image and index builds.
- Allows the marketplace and boot catalogs to evolve independently (if organizational needs require it).
- PR #32 duplicate-detector (already shipped, 2026-05-20) catches same-plugin-enabled-twice scenarios, mitigating the worst symptom.
- Lower risk: no new CI/build dependencies introduced.
- Preserves current practices (git-commit-driven for `default.yaml`).

**Disadvantages:**
- Every plugin addition is two separate edits (one in each repo), increasing operational friction and inconsistency risk.
- Drift between catalogs accumulates over time: a plugin in the index but disabled in `default.yaml` confuses operators. A plugin removed from one but not the other becomes a maintenance burden.
- Operators must understand the architectural split; mental model is more complex.
- Documentation burden: the split must be explained and kept up-to-date (topics/plugin-selection-surfaces.md addresses this).
- Non-obvious that editing the catalog affects different surfaces (marketplace vs. boot selection).
- Duplicate-detector is a band-aid, not a solution.

## Constraints that Forma A or Forma B must address before proceeding

**1. Version-lockstep between Backstage host and `plugin-catalog-index`**
- Both image artifacts must be tagged with compatible versions (e.g., both `bs_1.49.4`).
- This is a **process constraint**, not a one-time implementation task.
- Critical question: Who owns publishing the `plugin-catalog-index` image in lockstep with the distro's release cadence?
- Requires cross-team coordination (distro team + index maintainers).
- If the index lags, the image contains stale plugin refs. If it leads, the image may be incompatible with the index.
- Alternative approach: allow the index to lag or lead (lower risk but higher operational complexity and documentation burden).

**2. `dynamicArtifact: ./` entries (preInstalled local bundles)**
- Approximately 7 current entries use local filesystem bundles (`./` path), not OCI references.
- These are packaged inside the container image; unification cannot move them to an external index without breaking encapsulation.
- Unification must decide:
  - (a) Keep them outside the index as a special case, managed separately.
  - (b) OCI-export them separately (non-trivial effort).
  - (c) Remove them entirely (may break backward compatibility; audit pass required).
- Impact assessment: Audit all `dynamicArtifact: ./` entries to understand dependencies and breaking-change risk.

**3. Audit and reconciliation**
- Entries present in `default.yaml` but absent from the index, and vice versa, require a reconciliation pass.
- Example: a plugin in the index but missing from `default.yaml` suggests incomplete deprecation or intentional omission; both cases need clarification.
- Example: a plugin in `default.yaml` but absent from the index (not published to quay) suggests it is obsolete or internal-only.
- Risk if ignored: unification could accidentally remove plugins or expose half-deprecated entries to the marketplace.
- Effort: ~2–4 hours to enumerate, cross-reference, and document findings.

## Status of execution

- **Multi-sprint scope, explicitly deferred** — unification work is out of the current consolidation sprint. This ADR documents the decision; implementation is blocked pending owner assignment and constraint resolution. Do not start unification work as part of current polish or admin effort.
- **Safe quick-win** (independent, can ship anytime): `dynamic-plugins.default.yaml` contains a naming bug — the entry `devportal-marketplace-backend-dynamic-dynamic` has a duplicated `-dynamic` suffix. This is a 1-line fix and is **not blocked** by unification decisions. Recommend separating into a quick follow-up PR.
- **Guard-rail already shipped:** PR #32 (2026-05-20) added a boot-time duplicate-plugin detector that exits with code 78 if the same plugin appears with two different OCI refs across all enabled surfaces (preset + override + marketplace). This mitigates the worst operator error scenario (accidentally enabling the same plugin twice) but does not solve the underlying catalog split.

## Consequences

**1. Operator education required**
- Operators must understand that `plugin-catalog-index` (marketplace UI) and `dynamic-plugins.default.yaml` (boot) are independent sources of truth with independent update mechanisms.
- Recommended reading: [topics/plugin-selection-surfaces.md](../topics/plugin-selection-surfaces.md) — explains the three selection surfaces, precedence rules, and operator decision tree.
- Education gap identified: "operators may not understand the preset model without guidance." Recommend a walkthrough or tutorial (backlog item; out of scope for this sprint).

**2. This ADR becomes the reference for future unification work**
- Any effort to consolidate the catalogs must revisit this document.
- Future owner must:
  - Validate the three constraints and determine feasibility of Forma A or B.
  - Make an explicit choice between Forma A/B based on organizational priorities (latency vs. coordination vs. offline support).
  - Assign clear, sustained ownership (unification requires multiple sprints).
- Do not assume the deferral is permanent; it is time-boxed.

**3. Revisit trigger (deferred decision point)**
- If the dual-catalog model persists unchanged beyond 4 sprints (target: early August 2026), schedule a revisit to answer:
  - Is there now an owner committed to unification?
  - Have the constraints changed (e.g., has version-lockstep become operationally required)?
  - Has the operational cost of the split become intolerable?
- If the answer to all three is "no," update this ADR's status from "Accepted (with deferred execution)" to "Accepted, no unification planned," explaining why the split is now the stable equilibrium.

**4. No architectural effect today**
- Editing the *vitrine* should have zero effect on the image's architecture or boot sequence.
- The *resolver* treats the catalog as read-only and separately composes selections from the three surfaces.
- This design ensures that the architectural coherence (one vitrine, three surfaces, one resolver) remains valid even while the vitrine is split across two repos.

## Cross-references

- **[ADR-010 § Unified image and presets](./010-unified-image-and-presets.md)** — defines the preset model, the boot-time resolver logic, and the conceptual split between *catalog* and *selection*.
- **[ADR-011 § Frontend design system](./011-frontend-design-system.md)** — documents the theme system as a dynamic plugin enabled by preset.
- **[topics/plugin-selection-surfaces.md](../topics/plugin-selection-surfaces.md)** — operator-facing documentation of the three selection surfaces, precedence rules, and decision tree for operators choosing which surface to use.
- **[PR #32](https://github.com/veecode-io/devportal-platform/pull/32)** — implements the duplicate-plugin detector guard-rail (shipped 2026-05-20).
- **`entrypoint.sh`** — lines 43–72 (catalog index download via skopeo), 83–160 (preset resolver with variable validation), 192–203 (includes chain assembly), 220–274 (template substitution for version and registry placeholders).

## Implementation notes for future unification work

The following notes are provided to guide future owners attempting Forma A or Forma B.

### Forma A implementation sketch

1. Extend the existing catalog index download (entrypoint.sh lines 43–72) to include generation of `dynamic-plugins.yaml` includes chain.
2. Parse the index YAML to extract OCI refs and metadata.
3. Apply selection rules (preset + override + marketplace) to determine enabled plugins.
4. Validate that all referenced plugins exist in the index (catch typos, deprecations).
5. Cache the generated YAML in memory (or `/tmp`) to avoid re-parsing.
6. Fall back to an embedded catalog if the index fetch fails (must be baked into the image as a safety mechanism).
7. Boot continues to Backstage with the resolved plugin map.

**Risk mitigation:** The fallback catalog is mandatory. Without it, any index unavailability causes a pod crash.

### Forma B implementation sketch

1. CI pipeline (GitHub Actions or equivalent) pulls `plugin-catalog-index` image at release time.
2. Extract the YAML contents from the index image using skopeo.
3. Cross-reference with current `dynamic-plugins.default.yaml` to identify:
   - Plugins in the index but not in `default.yaml` (new or missing entries).
   - Plugins in `default.yaml` but not in the index (deprecated or internal-only entries).
   - Version mismatches for shared entries.
4. Materialize a new `dynamic-plugins.default.yaml` from the index contents.
5. Preserve `dynamicArtifact: ./` entries from the current version (they have no index equivalent).
6. Commit the generated file with a message like "chore: catalog generated from plugin-catalog-index bs_X.Y.Z".
7. Release the image with the updated `default.yaml`.

**Version-lockstep requirement:** The CI pipeline must tag the index image with the same semver as the distro (e.g., both `bs_0.2.0`). This requires coordinated publishing: distro release → index publish with matching tag.

### Reconciliation checklist for Forma A or B

- [ ] Enumerate all entries in `dynamic-plugins.default.yaml`.
- [ ] Cross-reference each against `plugin-catalog-index`.
- [ ] For each missing entry in the index: document reason (deprecated? internal? intentional omission?).
- [ ] For each `dynamicArtifact: ./` entry: assess feasibility of OCI export or permanent special-case handling.
- [ ] For each disabled entry in `default.yaml`: verify it is intentionally disabled (not forgotten).
- [ ] Verify that all OCI refs in `default.yaml` resolve and match the index (same bundle image tag, no version drift).

## Deferred quick-wins and guard-rails

**The `-dynamic-dynamic` bug fix** is independent of unification and can ship immediately:
```yaml
# BEFORE (incorrect, doubled suffix)
- name: devportal-marketplace-backend-dynamic-dynamic

# AFTER (corrected)
- name: devportal-marketplace-backend-dynamic
```

This is a 1-line fix that should be prioritized separately (e.g., in a quick bug-fix PR).

**PR #32 duplicate-detector** is a permanent guard-rail: it catches the worst symptom (same plugin enabled twice via different OCI refs). This does not solve the split-catalog problem, but it prevents the most confusing failure mode.

---

**Document history:**
- 2026-05-22: ADR-013 accepted with Forma C (deferred unification). Version-lockstep, preInstalled plugins, and audit findings deferred. Revisit trigger: 4 sprints (early August 2026).
