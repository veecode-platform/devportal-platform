---
name: glossary
description: Backstage terms used throughout these docs, one-line definitions with upstream links.
type: reference
audience: [operator, plugin-author, contributor]
---

# Glossary

> Upstream Backstage concepts referenced throughout the devportal-platform docs. Each entry is one or two sentences with a link to the canonical upstream docs.

## Catalog

The Backstage feature that ingests software entities (Components, Systems, APIs, Resources, Groups, Users) from `catalog-info.yaml` files and other providers. Upstream: <https://backstage.io/docs/features/software-catalog/>.

## Catalog provider

A backend module that discovers and ingests entities from a source (GitHub repos, GitLab groups, LDAP, Keycloak, etc.) into the catalog. Upstream: <https://backstage.io/docs/features/software-catalog/external-integrations>.

## Dynamic plugin

A plugin loaded at runtime from a path under `/app/dynamic-plugins-root/` rather than compiled into the backend bundle. See [`topics/dynamic-plugins.md`](../topics/dynamic-plugins.md).

## Entity

A unit of metadata in the catalog (a service, a library, a user, a group, etc.). Defined by `kind`, `metadata`, `spec`. Upstream: <https://backstage.io/docs/features/software-catalog/descriptor-format>.

## Mount point

A named extension slot in the Backstage frontend where a dynamic plugin can register a component (e.g. `entity.page.ci/cards`, `global.header/component`). Upstream / RHDH: <https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/frontend-plugin-wiring.md>.

## OCI bundle

An OCI image whose layers carry one or more pre-built dynamic plugins; pulled by `install-dynamic-plugins.py` at boot using `skopeo`. See [`topics/dynamic-plugins.md`](../topics/dynamic-plugins.md) and [`topics/plugin-packaging.md`](../topics/plugin-packaging.md).

## Preset

A versioned YAML contract selected at runtime via `VEECODE_PRESETS` that names which plugins to enable, which env vars are required, and which `app-config` to layer in. See [`topics/presets.md`](../topics/presets.md).

## Preset tier

Core (always on, no preset gating), `recommended` (chrome plugins that work with zero config), and integration presets (everything that needs customer-specific config). See [`topics/presets.md`](../topics/presets.md) § Tiers.

## Scaffolder

The Backstage feature that runs software templates to create new repos / projects / catalog entities. Upstream: <https://backstage.io/docs/features/software-templates/>.

## Scalprum

An independent Module Federation runtime (from the `@scalprum/*` packages) that loads dynamic frontend plugins into the running Backstage app. RHDH popularised it for Backstage but did not author or fork it; this image consumes the same upstream packages directly. The Backstage-side wiring (the `DynamicRoot` shell) is RHDH-derived.

## DynamicRoot

The frontend shell — at [`packages/app/src/components/DynamicRoot/`](../../packages/app/src/components/DynamicRoot/) — that initialises Scalprum, fetches each dynamic plugin's manifest from `/api/scalprum/plugins`, registers their mount points and dynamic routes, and renders the app. Adapted from RHDH.

## Module Federation

The webpack/rspack mechanism that ships chunks separately from the host bundle and resolves shared dependencies at runtime. Scalprum builds on it. Upstream: <https://webpack.js.org/concepts/module-federation/>.

## RHDH

Red Hat Developer Hub — Red Hat's Backstage distribution. devportal-platform draws several architectural patterns from RHDH (the dynamic-plugins frontend wiring, the `DynamicRoot` shell, the marketplace plugin set) but is not a fork. Repo: <https://github.com/redhat-developer/rhdh>.

## BUI / `@backstage/ui`

The first-party Backstage UI component library (post-MUI). devportal-platform's frontend is on MUI v5 + the older `@backstage/core-components`; the BUI is referenced in [`ADR-011`](../adr/011-frontend-design-system.md) as part of the future design-system direction. Upstream: <https://ui.backstage.io>.

## Scaffolder action

A unit of work a software template can execute (e.g. `publish:github`, `fetch:template`). Plugins can register their own. Upstream: <https://backstage.io/docs/features/software-templates/builtin-actions>.

## Static plugin

A plugin compiled into the backend bundle via `backend.add(import('@backstage/plugin-…'))` rather than loaded dynamically. The auth providers, catalog, scaffolder, RBAC, and TechDocs core ship static.

## TechDocs

Backstage's docs-as-code system — MkDocs-built sites rendered from a `catalog-info.yaml`-registered docs source. Upstream: <https://backstage.io/docs/features/techdocs/>.
