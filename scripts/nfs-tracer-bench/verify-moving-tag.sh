#!/usr/bin/env bash
# T1.3 item 5 — moving-tag test against a DISPOSABLE registry.
#
# The DAG requires: "teste de tag movel usa tag/repositorio DESCARTAVEL — nunca
# tag oficial". A LOCAL registry:2 is strictly safer than a throwaway repo on a
# real registry: it creates zero external state and is torn down at the end.
#
# What this proves that item 1b did NOT: item 1b planted a fake digest in the
# table and showed the YAML carried it, which proves the DB is read. It does not
# prove the pre-step ignores a tag that genuinely MOVED, because no tag moved.
# Here the tag really moves between two images with different digests.
#
# THE CODE UNDER TEST IS NOT MODIFIED. resolveDigest() runs `skopeo inspect`
# with no TLS flags, so rather than patching it:
#   - the registry speaks HTTPS with a self-signed cert;
#   - trust is granted through SSL_CERT_FILE, which Go's crypto/x509 honors and
#     the pre-step's execFileSync inherits;
#   - only the harness's OWN pushes use an explicit --dest-tls-verify=false.
# Measured here: CONTAINERS_REGISTRIES_CONF is ignored by skopeo 1.13.3 (proven
# by feeding it invalid TOML and getting no parse error), and `docker-daemon:`
# as a skopeo source fails on this host (docker API 1.41 < required 1.44) —
# hence `docker save` + `docker-archive:`.
set -uo pipefail

REG_PORT=5556
PG_PORT=55432
REG_NAME=t13i5-reg-tls
PG_NAME=t13i5-postgres
REPO="localhost:${REG_PORT}/t13/todo"
TAG=movingtag
SELECTOR=fake-plugin
TRUNK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRATCH="${TMPDIR:-/tmp}"
WORK=$(mktemp -d "$SCRATCH/t13i5.XXXXXX")

pass=0; fail=0
ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1"; fail=$((fail+1)); }
step() { echo; echo "=== $1 ==="; }

cleanup() {
  step "teardown"
  docker rm -f "$REG_NAME" "$PG_NAME" >/dev/null 2>&1
  docker rmi -f t13i5-a:local t13i5-b:local >/dev/null 2>&1
  rm -rf "$WORK"
  echo "  containers e imagens de teste removidos; $WORK apagado"
  echo "  nada foi publicado em registry externo"
}
trap cleanup EXIT

step "0. certificado self-signed + registry HTTPS descartavel + Postgres"
mkdir -p "$WORK/tls"
openssl req -x509 -newkey rsa:2048 -sha256 -days 2 -nodes \
  -keyout "$WORK/tls/server.key" -out "$WORK/tls/server.crt" \
  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
docker run -d --name "$REG_NAME" -p ${REG_PORT}:5000 -v "$WORK/tls":/certs:ro \
  -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/server.crt \
  -e REGISTRY_HTTP_TLS_KEY=/certs/server.key registry:2 >/dev/null 2>&1 \
  || { echo "FATAL: registry TLS nao subiu"; exit 1; }
docker run -d --name "$PG_NAME" -e POSTGRES_PASSWORD=postgres \
  -p ${PG_PORT}:5432 --tmpfs /var/lib/postgresql/data postgres:17-alpine >/dev/null 2>&1 \
  || { echo "FATAL: postgres nao subiu"; exit 1; }
for i in $(seq 1 45); do
  docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1
done
docker exec "$PG_NAME" pg_isready -U postgres || { echo "FATAL: pg nao ficou pronto"; exit 1; }
export SSL_CERT_FILE="$WORK/tls/server.crt"
echo "  registry HTTPS :$REG_PORT · postgres :$PG_PORT · SSL_CERT_FILE definido"

step "1. duas imagens genuinamente distintas (offline, FROM scratch)"
for v in a b; do
  mkdir -p "$WORK/$v"; echo "variant-$v" > "$WORK/$v/marker"
  printf 'FROM scratch\nCOPY marker /marker\n' > "$WORK/$v/Dockerfile"
  docker build -q -t "t13i5-$v:local" "$WORK/$v" >/dev/null 2>&1 || { echo "FATAL: build $v"; exit 1; }
  docker save "t13i5-$v:local" -o "$WORK/$v.tar" || { echo "FATAL: save $v"; exit 1; }
done

step "2. publicar A na tag movel, B numa tag separada"
skopeo copy --dest-tls-verify=false "docker-archive:$WORK/a.tar" "docker://${REPO}:${TAG}"       >/dev/null 2>&1 || { echo "FATAL: push A"; exit 1; }
skopeo copy --dest-tls-verify=false "docker-archive:$WORK/b.tar" "docker://${REPO}:variant-b"   >/dev/null 2>&1 || { echo "FATAL: push B"; exit 1; }
DIGEST_A=$(skopeo inspect "docker://${REPO}:${TAG}"     --format '{{.Digest}}' 2>/dev/null)
DIGEST_B=$(skopeo inspect "docker://${REPO}:variant-b"  --format '{{.Digest}}' 2>/dev/null)
echo "  digest A (na tag $TAG) = $DIGEST_A"
echo "  digest B (variant-b)  = $DIGEST_B"
[ -n "$DIGEST_A" ] && [ -n "$DIGEST_B" ] || { echo "FATAL: skopeo nao resolveu"; exit 1; }
[ "$DIGEST_A" != "$DIGEST_B" ] && ok "A e B tem digests distintos (pre-condicao)" \
  || { bad "A e B tem o MESMO digest — teste invalido"; exit 1; }

step "3. banco no schema do T1.3, resolved_digest NULL"
REF="oci://${REPO}:${TAG}!${SELECTOR}"
docker exec -i "$PG_NAME" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<EOF
CREATE DATABASE backstage_plugin_extensions;
EOF
docker exec -i "$PG_NAME" psql -U postgres -d backstage_plugin_extensions -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<EOF
CREATE TABLE marketplace_installations (
  package_name    text PRIMARY KEY,
  disabled        boolean NOT NULL DEFAULT false,
  config_yaml     text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  requested_ref   text,
  resolved_digest text
);
INSERT INTO marketplace_installations (package_name, requested_ref, disabled, config_yaml, resolved_digest)
VALUES ('${REF}', '${REF}', false, NULL, NULL);
EOF
echo "  ref = $REF"

cat > "$WORK/app-config.test.yaml" <<EOF
backend:
  database:
    client: pg
    connection:
      host: 127.0.0.1
      port: ${PG_PORT}
      user: postgres
      password: postgres
EOF

run_prestep() {
  ( cd "$TRUNK" && DEVPORTAL_DB_PATH="$WORK" EXTENSIONS_PRESTEP_FAIL_CLOSED=true \
      SSL_CERT_FILE="$WORK/tls/server.crt" \
      node docker/regenerate-extensions-install.js --config "$WORK/app-config.test.yaml" 2>&1
    echo "EXIT=$?" )
}
db_digest() {
  docker exec "$PG_NAME" psql -U postgres -d backstage_plugin_extensions -tAc \
    "SELECT COALESCE(resolved_digest,'<null>') FROM marketplace_installations;" 2>/dev/null | tr -d '\r' | tr -d ' '
}

step "4. primeiro boot — resolve a tag e PERSISTE o digest A"
# The expected ref, in full. Asserting only on the digest substring is what let a
# real defect through on the first run of this rig: the digest was right while the
# registry PORT and the repository path had been silently dropped by refWithDigest,
# emitting `oci://localhost@sha256:...` instead of `oci://localhost:5556/t13/todo@...`.
EXPECTED_REF="oci://${REPO}@${DIGEST_A}!${SELECTOR}"
echo "  ref esperado (completo): $EXPECTED_REF"
OUT1=$(run_prestep); echo "$OUT1" | sed 's/^/    /'
YAML1=$(cat "$WORK/extensions-install.yaml" 2>/dev/null)
echo "  --- YAML ---"; echo "$YAML1" | sed 's/^/    /'
echo "$YAML1" | grep -qF "@${DIGEST_A}" && ok "boot 1: YAML pinado no digest A" \
  || bad "boot 1: YAML NAO tem o digest A"
echo "$YAML1" | grep -qF "$EXPECTED_REF" \
  && ok "boot 1: ref COMPLETO correto (registry:porta/caminho preservados)" \
  || bad "boot 1: ref completo incorreto — esperado '$EXPECTED_REF'"
P=$(db_digest); echo "  resolved_digest no banco: $P"
[ "$P" = "$DIGEST_A" ] && ok "boot 1: digest A persistido" || bad "boot 1: banco tem '$P', esperado '$DIGEST_A'"

step "5. MOVER a tag de verdade: $TAG passa a apontar para B"
skopeo copy --dest-tls-verify=false "docker-archive:$WORK/b.tar" "docker://${REPO}:${TAG}" >/dev/null 2>&1 \
  || { echo "FATAL: push do move"; exit 1; }
NOW=$(skopeo inspect "docker://${REPO}:${TAG}" --format '{{.Digest}}' 2>/dev/null)
echo "  a tag $TAG agora resolve para: $NOW"
[ "$NOW" = "$DIGEST_B" ] && ok "a tag REALMENTE moveu (agora = digest B)" \
  || bad "a tag nao moveu (got '$NOW')"

step "6. TESTE DISCRIMINANTE — o segundo boot NAO pode seguir a tag"
rm -f "$WORK/extensions-install.yaml"
OUT2=$(run_prestep); echo "$OUT2" | sed 's/^/    /'
YAML2=$(cat "$WORK/extensions-install.yaml" 2>/dev/null)
echo "  --- YAML ---"; echo "$YAML2" | sed 's/^/    /'
echo "$YAML2" | grep -qF "@${DIGEST_A}" \
  && ok "boot 2: YAML AINDA no digest A — a tag movel foi ignorada" \
  || bad "boot 2: YAML nao tem o digest A"
echo "$YAML2" | grep -qF "$EXPECTED_REF" \
  && ok "boot 2: ref COMPLETO ainda correto" \
  || bad "boot 2: ref completo incorreto — esperado '$EXPECTED_REF'"
echo "$YAML2" | grep -qF "@${DIGEST_B}" \
  && bad "boot 2: REGRESSAO — o YAML seguiu a tag para o digest B" \
  || ok "boot 2: o digest B NAO aparece no YAML"
echo "$OUT2" | grep -q "persisted resolved_digest" \
  && bad "boot 2: re-resolveu e re-persistiu (deveria reusar o banco)" \
  || ok "boot 2: nenhuma nova resolucao (reuso do banco)"

step "RESULTADO"
echo "  PASS=$pass  FAIL=$fail"
[ "$fail" -eq 0 ] && echo "  ITEM 5 VERDE" || echo "  ITEM 5 VERMELHO"
exit "$fail"
