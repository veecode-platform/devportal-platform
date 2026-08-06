---
title: Phase A — P0 artefact admission register
status: active
updated: 2026-08-05
---

# Phase A — admission register

This file is **register only**. Until the core (Objective 1 / G1b) is green on the
published image, no Phase A task runs runtime, bisect or plugin configuration —
the rule is explicit and comes from the migration owner.

Each row answers one question: *does the artefact exist, by digest, and what
configuration does the host need?* Proving it **works** is T5.6/T5.8, against the
T-B digest, after G2.

Per-member format (MANIFESTO-PACK-V1): package/version/sourceRef · inclusion
form · digest · host configuration · companions.

---

## T-A.3 — AWS S3 catalog (ADMITTED)

The only Phase A item already settled, and settled **without a new decision**: the
choice is closed in the internal platform's own source of truth, not here.

| Field | Value |
|---|---|
| Decision | `ADR-0016 — s3-backed aws catalog producer`: the **core** provider (`catalog.providers.awsS3`), explicitly **not** Roadie's |
| Artefact | `quay.io/veecode/backstage-aws-dynamic-plugins:1.1.0!aws-s3-catalog-module-for-backstage` |
| Digest (verified against the registry on 2026-08-05) | `sha256:2b42df56a7e998f5f73468c6b333d43fa00d5c025b0443643ae9654609639b05` |
| Inclusion form | OCI, via `dynamic-plugins` |
| `requiredLevel` | `backend-r1` (it is a backend module; it has no frontend surface) |
| Host config | `catalog.providers.awsS3` (bucket + prefix) + credentials by **IRSA** on the ServiceAccount the chart creates |
| Companions | no frontend. The descriptor producer is external to the portal: one Lambda per AWS account writes YAML into the bucket (`devportal-catalog-lambda`), and the provider only reads. Producer ≠ provider — do not conflate the two when investigating an empty catalog |

Absence of contrary evidence, checked on both sides: `devportal-platform` ships
**no** S3 catalog plugin today (`dynamic-plugins.default.yaml` and `presets/*.yaml`
do not mention s3), and the internal platform's architecture records the consumer
as Backstage's own `awsS3` provider.

---

## T-A.1 · T-A.2 · T-A.4 · T-A.5 · T-A.6 — register pending

Not started, and deliberately so: they depend on reading the configuration actually
applied on the internal platform (`values.yaml.tpl` + `terraform.tfvars`), which is
register work and not runtime. The companions rule (DAG v3 erratum 5) holds for all
of them: a frontend is **not** admitted while the backend/API its flow depends on is
not identified in the tuple with version and digest.

| Task | State | Note |
|---|---|---|
| T-A.1 Kubernetes FE+BE | to register | the FE is the control remote used in G1/G1b; the BE comes from the `kubernetes` preset. Host config includes the TLS workaround `GLOBAL_AGENT_FORCE_GLOBAL_AGENT=false`, which the internal platform marks as *load-bearing* |
| T-A.2 Grafana | **blocked by a defect**, not by work | no form of configuring the `proxy` plugin works on the NFS image: `/api/proxy/*` answers 503 permanently while the pod stays *healthy*. Minimal repro ready (one route, literal `target`). Does not advance until the bug has an owner |
| T-A.4 RBAC | to register | needs to identify where `/rbac` reads roles from with enforcement OFF |
| T-A.5 Tech Radar | to register | read the origin of the default data before costing anything further |
| T-A.6 MCP Actions | to register | decide bundle re-export × dedicated export, not "whichever lands first" |
