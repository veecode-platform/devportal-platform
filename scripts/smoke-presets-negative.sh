#!/bin/bash
# Negative regression for the preset/var fail-fast contract (Axis 3 of the
# unified-image scorecard).
#
# For each case, boots the image with a deliberately incomplete environment
# and asserts:
#   1. container exits with code 78 (the preset/var fail-fast code),
#   2. boot was fast (≤15s — fail-fast happens before Backstage starts),
#   3. the error message names the offending input (missing variable, unknown
#      preset, or exclusive-group conflict).
#
# Companion to smoke-presets.sh (which exercises the happy path). The two
# scripts together protect the Axis 3 contract: "configuration is explicit
# and the boot fails cleanly when it isn't."
#
# Usage:
#   scripts/smoke-presets-negative.sh
#   DEVPORTAL_IMAGE=veecode/devportal:0.1.1 scripts/smoke-presets-negative.sh

set -uo pipefail
cd "$(dirname "$0")/.."

IMAGE="${DEVPORTAL_IMAGE:-veecode/devportal-platform:latest}"
CONTAINER=devportal-neg
MAX_SECONDS=15

PASSED=()
FAILED=()

run_case() {
  local name="$1" presets="$2" expect1="$3" expect2="$4"
  shift 4

  local env_args=()
  for kv in "$@"; do env_args+=( -e "$kv" ); done

  echo ""
  echo "=========================================="
  echo "TESTING: $name  (VEECODE_PRESETS=$presets)"
  echo "=========================================="
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

  local start logs rc elapsed
  start=$(date +%s)
  set +e
  logs=$(docker run --rm --name "$CONTAINER" \
    -e "VEECODE_PRESETS=$presets" \
    "${env_args[@]}" \
    "$IMAGE" 2>&1)
  rc=$?
  set -e
  elapsed=$(($(date +%s) - start))

  local fail=""
  [ "$rc" -ne 78 ]               && fail="$fail [exit=$rc, want 78]"
  [ "$elapsed" -gt "$MAX_SECONDS" ] && fail="$fail [slow: ${elapsed}s > ${MAX_SECONDS}s]"
  echo "$logs" | grep -q -- "$expect1" || fail="$fail [missing log substring: $expect1]"
  if [ -n "$expect2" ]; then
    echo "$logs" | grep -q -- "$expect2" || fail="$fail [missing log substring: $expect2]"
  fi

  if [ -z "$fail" ]; then
    echo "PASS: exit=$rc in ${elapsed}s"
    PASSED+=("$name (${elapsed}s)")
  else
    echo "FAIL:$fail"
    echo "--- last 20 log lines ---"
    echo "$logs" | tail -20
    FAILED+=("$name —$fail")
  fi
}

# 1. Missing var per preset family. We omit the variable named in expect1; all
#    other required vars for that preset are supplied as harmless dummies so the
#    only thing the resolver can complain about is the omission.
run_case github_missing_pat       "github"     "GITHUB_PAT"        "require variables that are not set" \
  GITHUB_ORG=test-org

run_case gitlab_missing_token     "gitlab"     "GITLAB_TOKEN"      "require variables that are not set" \
  GITLAB_HOST=gitlab.test GITLAB_AUTH_CLIENT_ID=fake GITLAB_AUTH_CLIENT_SECRET=fake GITLAB_GROUP=test

run_case keycloak_missing_session "keycloak"   "AUTH_SESSION_SECRET" "require variables that are not set" \
  KEYCLOAK_BASE_URL=https://kc.test KEYCLOAK_REALM=master KEYCLOAK_CLIENT_ID=backstage KEYCLOAK_CLIENT_SECRET=fake

run_case azure_missing_devops     "azure"      "AZURE_DEVOPS_TOKEN" "require variables that are not set" \
  AZURE_DEVOPS_HOST=dev.azure.com AZURE_DEVOPS_ORG=test AZURE_DEVOPS_PROJECT=test

run_case ldap_missing_secret      "ldap"       "LDAP_SECRET"       "require variables that are not set" \
  LDAP_URL=ldap://localhost LDAP_DN=cn=admin LDAP_USERS_BASE_DN=ou=people LDAP_GROUPS_BASE_DN=ou=groups

# 2. Unknown preset name — different code path, same exit code, same UX contract.
run_case preset_not_found         "naoexiste"  "not found"         "available presets"

# 3. Exclusive-group conflict — two identity presets selected. Fail-fast runs
#    before any download or var validation; no env vars needed.
run_case identity_exclusive_group "github-auth,keycloak" "exclusive group" "cannot be selected together"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo ""
echo "=========================================="
echo "NEGATIVE SMOKE SUMMARY"
echo "=========================================="
echo "PASSED (${#PASSED[@]}):"
for n in "${PASSED[@]}"; do echo "  ✓ $n"; done
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "FAILED (${#FAILED[@]}):"
  for n in "${FAILED[@]}"; do echo "  ✗ $n"; done
fi

echo ""
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "All ${#PASSED[@]} negative cases passed."
  exit 0
else
  echo "${#FAILED[@]} of $((${#PASSED[@]} + ${#FAILED[@]})) negative cases failed."
  exit 1
fi
