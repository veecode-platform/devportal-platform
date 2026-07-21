---
name: tech-stack
description: Pinned versions of Backstage, Node, Yarn, React, MUI, TypeScript, and the Scalprum runtime.
type: reference
audience: [operator, contributor]
---

# Tech stack & pinned versions

| Component | Version | Source of truth |
|---|---|---|
| Backstage | 1.53.0 | [`backstage.json`](../../backstage.json) |
| Node.js | 20 or 22 (image runs Node 22 on UBI10) | [`package.json`](../../package.json) `engines` |
| Yarn | 4.12.0 (Corepack-managed) | [`package.json`](../../package.json) `packageManager` |
| React | 18.3.1 | [`packages/app/package.json`](../../packages/app/package.json) |
| MUI | 5.15.10+ | [`packages/app/package.json`](../../packages/app/package.json) — see [`MUI_MIGRATION_STATUS.md`](../MUI_MIGRATION_STATUS.md) |
| TypeScript | ~5.8 | [`package.json`](../../package.json) `devDependencies` |
| Scalprum + Webpack Module Federation | runtime dynamic frontend loading | [`packages/app/src/components/DynamicRoot/`](../../packages/app/src/components/DynamicRoot/) |

## Frontend system

Backstage **legacy frontend system** (`createApp` from `@backstage/app-defaults`) inside a Scalprum host. The New Frontend System is **deferred** — see [ADR-011 § "Phase the rest"](../adr/011-frontend-design-system.md).

## Backstage version bump cadence

Independent track from this repo's release cycle. See [`UPGRADING.md`](../UPGRADING.md) for the upgrade procedure and [ADR-010 § "Migration deferral — Backstage 1.50 bump postponed"](../adr/010-unified-image-and-presets.md) for the historical deferral rationale (superseded by the 1.53.0 bump).
