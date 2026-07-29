# OFS → NFS migration glossary

Status: working vocabulary; terms can be refined by later evidence

This glossary is scoped to this migration. It exists to keep similar-sounding
claims separate. In particular, a source package that appears ready, an
artifact that contains an NFS entrypoint and a surface proven in the NFS
runtime are different facts.

## Core terms

| Term | Meaning in this migration |
| --- | --- |
| OFS | Old Frontend System: the legacy frontend model used by the current app, including host-authored DynamicRoot/Scalprum wiring and overlay declarations. |
| NFS | New Frontend System: the frontend extension model in which plugins expose self-describing frontend extensions, commonly through an `./alpha` entrypoint and blueprints. |
| arm | An independently runnable frontend path. The current `packages/app` path is the OFS arm; `app-next` is the experimental NFS arm. |
| mode | The explicitly selected runtime posture: `ofs`, `nfs` or controlled `ab`. A result from one mode is not evidence for another. |
| plugin | A declared fleet member that contributes frontend, backend or both. The migration inventory tracks the package, source, artifact and runtime surface separately. |
| shell | The host application and its platform behavior: authentication, branding, navigation, providers, routes, catalog, scaffolder, TechDocs and other shared capabilities. |
| shell parity | Equivalence of a user-relevant behavior between arms. It does not mean that the NFS implementation must preserve the OFS wiring or internal component tree. |
| surface | An observable plugin or shell behavior, such as an entity tab, page, route, nav item, API-backed panel, theme or translation. |
| NFS entrypoint | The package entrypoint intended for NFS discovery, normally `./alpha`. Presence alone does not prove that the published artifact or runtime works. |
| blueprint | An NFS declaration point used by a plugin to contribute a typed extension to the app graph. The exact blueprint is part of the package inspection and must not be inferred from a filename alone. |
| composed configuration | Configuration shared by multiple plugin concerns, such as GitHub access and GitHub authentication. The application remains a possible source of shared integration data; each plugin still declares its own contract. |
| fleet | The frozen set of VeeCode dynamic-plugin packages and related shell/backend components included in a migration run. |
| control cohort | A deliberately small set of fleet members chosen to exercise different migration and observation classes before the full census. |
| port | The implementation activity of expressing an existing behavior through NFS extensions or an accepted replacement. This is a verb, not a separate architecture or tool. |

## Evidence and lifecycle terms

| Term | Meaning in this migration |
| --- | --- |
| source-ready | Source inspection found an apparent NFS entrypoint and declarations. It says nothing about the published artifact or runtime. |
| artifact-ready | The resolved artifact contains the expected NFS package surface. It still requires runtime proof. |
| runtime-verified | A specific NFS surface was exercised with attributable provenance and an observable result. |
| NFS-ready | Reserved for a claim that includes the relevant source, artifact, host and runtime evidence. It must not be assigned from `./alpha` presence alone. |
| coverage gap | The harness or target shell cannot currently observe a declared surface. It is a result requiring explicit treatment, not a silent pass. |
| no-report | A declared subject did not produce the required report. This is a blocker for a complete run. |
| broken | Runtime evidence attributes a failure to the subject or its declared contract. |
| unsupported | The subject or surface is outside the current supported NFS target, with that boundary explicitly recorded. |
| requires-port | Source inspection found no usable NFS entrypoint or equivalent declaration; an implementation port is required before runtime verification. |
| blocked | Progress cannot continue for this subject until a named dependency, export or decision is resolved. |
| config-scenario | The inventory row represents a composed configuration contract rather than one isolated frontend package. |
| escalated | The next action requires a human decision, manual repair or a change outside the current automated scope. |
| claim | A Drydock assertion about one subject, mode and surface. A claim is valid only when its evidence contract is complete enough to reproduce or audit it. |
| gate | A question with explicit evidence required before the migration can advance. Passing one gate does not imply cutover readiness. |
| cutover | The human-approved change of the production default from the OFS arm to the NFS arm. |

## Terms deliberately avoided

- **Porter**: not a module, role or migration architecture. Use “port” for the
  implementation activity and name the actual package or owner.
- **NFS migration complete**: too broad unless the shell, declared fleet,
  artifacts, runtime surfaces, evidence and rollback posture are all scoped.
- **Supports NFS**: incomplete without saying whether the claim concerns source,
  artifact or runtime evidence.
