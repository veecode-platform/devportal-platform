#!/bin/bash
# Preset boot validation harness.
#
# For each preset (or composition) in $TESTS, starts a container with dummy values
# for the preset's required vars, waits for the healthcheck, and counts the loaded
# dynamic plugins. Exits non-zero if any preset fails its gate. Dummy creds are
# non-empty placeholders — they pass boot validation but won't reach real services;
# the gate is "preset config valid + backend boots + plugins register", not
# end-to-end integration.
#
# Usage:
#   scripts/smoke-presets.sh                                # all defaults, :latest image
#   scripts/smoke-presets.sh --image veecode/devportal:1.0  # specific tag
#   scripts/smoke-presets.sh --presets recommended,mcp      # subset (csv of tests)
#   scripts/smoke-presets.sh --help
#
# Env:
#   DEVPORTAL_MEM     — container memory (default 4g; some combos OOM under 2g)
#   DEVPORTAL_MEMSWAP — container swap (default 6g)

set -uo pipefail

cd "$(dirname "$0")/.."

IMAGE="${DEVPORTAL_IMAGE:-veecode/devportal-platform:latest}"
PRESETS_FILTER=""
DEVPORTAL_MEM="${DEVPORTAL_MEM:-4g}"
DEVPORTAL_MEMSWAP="${DEVPORTAL_MEMSWAP:-6g}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image) IMAGE="$2"; shift 2 ;;
    --presets) PRESETS_FILTER="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,21p' "$0" | sed 's/^# *//'
      exit 0 ;;
    *) echo "unknown arg: $1 (see --help)" >&2; exit 64 ;;
  esac
done

# Dummy values for required vars — non-empty so boot validation passes. These won't
# reach real services; gate is "preset config valid + backend boots". Keep aligned
# with each preset's `requires.variables` block in presets/<name>.yaml.
declare -A DUMMY=(
  [github]='GITHUB_PAT=ghp_fakefakefakefakefakefakefakefakefake GITHUB_ORG=test-org'
  [gitlab]='GITLAB_HOST=gitlab.test GITLAB_AUTH_CLIENT_ID=fake GITLAB_AUTH_CLIENT_SECRET=fake GITLAB_TOKEN=glpat-fake GITLAB_GROUP=test-group'
  [azure]='AZURE_DEVOPS_TOKEN=fake AZURE_DEVOPS_HOST=dev.azure.com AZURE_DEVOPS_ORG=test-org AZURE_DEVOPS_PROJECT=test-project'
  [keycloak]='KEYCLOAK_BASE_URL=https://kc.test/auth KEYCLOAK_REALM=master KEYCLOAK_CLIENT_ID=backstage KEYCLOAK_CLIENT_SECRET=fake AUTH_SESSION_SECRET=fake-secret-32chars-1234567890ab'
  [ldap]='LDAP_URL=ldap://localhost LDAP_DN=cn=admin,dc=test LDAP_SECRET=fake LDAP_USERS_BASE_DN=ou=people,dc=test LDAP_GROUPS_BASE_DN=ou=groups,dc=test'
  [jenkins]='JENKINS_URL=http://jenkins.test JENKINS_USERNAME=admin JENKINS_TOKEN=fake'
  [kubernetes]='K8S_CLUSTER_NAME=test-cluster K8S_CLUSTER_URL=https://kubernetes.test K8S_CLUSTER_TOKEN=fake'
  [sonarqube]='SONARQUBE_BASE_URL=https://sonar.test SONARQUBE_API_KEY=fake'
  [mcp-chat]='MCP_CHAT_PROVIDER=openai MCP_CHAT_API_KEY=sk-fake MCP_CHAT_MODEL=gpt-5.4'
)

# Default test matrix: single-preset boots + key compositions. Operators can
# override via --presets a,b,c (csv of tests; comma INSIDE a test = composition).
ALL_TESTS=(
  recommended
  veecode-theme
  github
  gitlab
  azure
  keycloak
  ldap
  jenkins
  kubernetes
  sonarqube
  mcp
  'recommended,mcp'
  'recommended,mcp,mcp-chat'
)

if [ -n "$PRESETS_FILTER" ]; then
  IFS=';' read -r -a TESTS <<<"$PRESETS_FILTER"
else
  TESTS=("${ALL_TESTS[@]}")
fi

declare -A RESULTS
declare -A PLUGINS_COUNT
declare -A BOOT_TIME
FAILURES=0

for combo in "${TESTS[@]}"; do
  echo ""
  echo "=========================================="
  echo "TESTING: $combo"
  echo "=========================================="
  docker rm -f devportal-dev >/dev/null 2>&1 || true

  # Aggregate dummy env for every preset in the composition.
  env_line=""
  for p in ${combo//,/ }; do
    [ -n "${DUMMY[$p]:-}" ] && env_line="$env_line ${DUMMY[$p]}"
  done

  start=$(date +%s)
  # shellcheck disable=SC2086
  output=$(eval "DEVPORTAL_IMAGE=$IMAGE DEVPORTAL_MEM=$DEVPORTAL_MEM DEVPORTAL_MEMSWAP=$DEVPORTAL_MEMSWAP VEECODE_PRESETS=$combo $env_line ./scripts/dev-run.sh run 2>&1")
  elapsed=$(($(date +%s) - start))
  BOOT_TIME[$combo]=$elapsed

  if echo "$output" | grep -q "TIMEOUT"; then
    # Disambiguate timeout: was it exit-78 (missing vars) or a real hang?
    if docker logs devportal-dev 2>&1 | grep -q "requires.*variables that are not set"; then
      RESULTS[$combo]="FAIL_MISSING_VARS (${elapsed}s)"
    else
      RESULTS[$combo]="BOOT_TIMEOUT (${elapsed}s)"
    fi
    PLUGINS_COUNT[$combo]="-"
    FAILURES=$((FAILURES + 1))
    echo "FAIL: ${RESULTS[$combo]}"
    continue
  fi
  if ! echo "$output" | grep -q "up ("; then
    RESULTS[$combo]="BOOT_FAIL (${elapsed}s)"
    PLUGINS_COUNT[$combo]="-"
    FAILURES=$((FAILURES + 1))
    echo "FAIL: didn't boot"
    continue
  fi

  # Healthcheck passed. Count loaded plugins.
  TOKEN=$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh -H 'Content-Type: application/json' -d '{}' | jq -r '.backstageIdentity.token' 2>/dev/null)
  if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    RESULTS[$combo]="AUTH_FAIL (${elapsed}s)"
    PLUGINS_COUNT[$combo]="?"
    FAILURES=$((FAILURES + 1))
    continue
  fi
  count=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:7007/api/dynamic-plugins-info/loaded-plugins 2>/dev/null | jq -r '.[].name' 2>/dev/null | wc -l)
  RESULTS[$combo]="PASS (${elapsed}s)"
  PLUGINS_COUNT[$combo]=$count
  echo "PASS: ${count} plugins loaded in ${elapsed}s"
done

docker rm -f devportal-dev >/dev/null 2>&1 || true

echo ""
echo "=========================================="
echo "SMOKE TEST SUMMARY"
echo "=========================================="
printf "%-35s  %-30s  %s\n" "PRESET(S)" "RESULT" "PLUGINS"
printf "%-35s  %-30s  %s\n" "-----------------------------------" "------------------------------" "-------"
for combo in "${TESTS[@]}"; do
  printf "%-35s  %-30s  %s\n" "$combo" "${RESULTS[$combo]:-NOT_RUN}" "${PLUGINS_COUNT[$combo]:-?}"
done

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "All ${#TESTS[@]} preset tests passed."
  exit 0
else
  echo "$FAILURES of ${#TESTS[@]} preset tests failed."
  exit 1
fi
