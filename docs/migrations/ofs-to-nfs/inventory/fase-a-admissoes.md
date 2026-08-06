---
title: Fase A — registro de admissão dos artefatos P0
status: active
updated: 2026-08-05
---

# Fase A — registro de admissão

Este arquivo é **só registro**. Enquanto o core (Objetivo 1 / G1b) não estiver
verde na imagem publicada, nenhuma tarefa da Fase A executa runtime, bisect ou
configuração de plugin — a regra é explícita e vem do dono da migração.

Cada linha responde a uma pergunta só: *o artefato existe, por digest, e qual
configuração o host precisa?* Provar que ele **funciona** é T5.6/T5.8, contra o
digest de T-B, depois do G2.

Formato por membro (MANIFESTO-PACK-V1): package/version/sourceRef · forma de
inclusão · digest · configuração no host · companions.

---

## T-A.3 — AWS S3 catalog (ADMITIDO)

Único item da Fase A já resolvido, e resolvido **sem decisão nova**: a escolha
está fechada na fonte de verdade da Plataforma Interna, não aqui.

| Campo | Valor |
|---|---|
| Decisão | `ADR-0016 — s3-backed aws catalog producer`: provider do **core** (`catalog.providers.awsS3`), explicitamente **não** o do Roadie |
| Artefato | `quay.io/veecode/backstage-aws-dynamic-plugins:1.1.0!aws-s3-catalog-module-for-backstage` |
| Digest (verificado no registry em 05/08/2026) | `sha256:2b42df56a7e998f5f73468c6b333d43fa00d5c025b0443643ae9654609639b05` |
| Forma de inclusão | OCI, via `dynamic-plugins` |
| `requiredLevel` | `backend-r1` (é um backend module; não tem superfície de frontend) |
| Config no host | `catalog.providers.awsS3` (bucket + prefixo) + credencial por **IRSA** na ServiceAccount criada pelo chart |
| Companions | nenhum frontend. O produtor dos descriptors é externo ao portal: uma Lambda por conta AWS escreve YAML no bucket (`devportal-catalog-lambda`), e o provider apenas lê. Produtor ≠ provider — não confundir os dois ao investigar catálogo vazio |

Ausência de evidência contrária, verificada nos dois lados: `devportal-platform`
não embarca **nenhum** plugin de catálogo S3 hoje (`dynamic-plugins.default.yaml`
e `presets/*.yaml` não citam s3), e a arquitetura da Plataforma Interna registra
o consumidor como o provider `awsS3` do próprio Backstage.

---

## T-A.1 · T-A.2 · T-A.4 · T-A.5 · T-A.6 — pendentes de registro

Não iniciadas, e deliberadamente: dependem de ler a configuração real aplicada na
Plataforma Interna (`values.yaml.tpl` + `terraform.tfvars`), o que é trabalho de
registro e não de runtime. A regra dos companions (erratum 5 do DAG v3) vale para
todas: um frontend **não** está admitido enquanto o backend/API de que o fluxo
depende não estiver identificado na tupla com versão e digest.

| Tarefa | Estado | Observação |
|---|---|---|
| T-A.1 Kubernetes FE+BE | a registrar | o FE é o remote de controle usado no G1/G1b; o BE vem do preset `kubernetes`. Config do host inclui o workaround de TLS `GLOBAL_AGENT_FORCE_GLOBAL_AGENT=false`, que a Plataforma Interna marca como *load-bearing* |
| T-A.2 Grafana | **bloqueada por defeito**, não por trabalho | nenhuma forma de config do plugin `proxy` funciona na imagem NFS: `/api/proxy/*` responde 503 permanentemente enquanto o pod fica *healthy*. Repro mínimo pronto (uma rota, `target` literal). Não avança até o bug ter dono |
| T-A.4 RBAC | a registrar | precisa identificar de onde `/rbac` lê roles com enforcement OFF |
| T-A.5 Tech Radar | a registrar | ler a origem dos dados default antes de custear além |
| T-A.6 MCP Actions | a registrar | decidir reexport do bundle × export dedicado, não "o que vier primeiro" |
