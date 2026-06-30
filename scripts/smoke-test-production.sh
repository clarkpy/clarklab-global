#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://api.yourdomain.com}"
APP_URL="${APP_URL:-https://app.yourdomain.com}"
SIGNUP_CODE="${SIGNUP_ACCESS_CODE:-}"
SMOKE_USER="smoke-$(date +%s)@example.com"
SMOKE_PASS="SmokeTest1!"

fail() {
  echo "FAIL: $1"
  exit 1
}

pass() {
  echo "OK: $1"
}

echo "Clarklab production smoke test"
echo "API_URL=$API_URL"
echo "APP_URL=$APP_URL"
echo ""

HEALTH="$(curl -fsS "$API_URL/health" 2>/dev/null)" || fail "GET $API_URL/health"
echo "$HEALTH" | grep -q '"status":"ok"' || fail "health response missing status ok"
pass "API health"

PUBLIC="$(curl -fsS "$API_URL/api/public/status" 2>/dev/null)" || fail "GET /api/public/status"
echo "$PUBLIC" | grep -q '"nodeCount"' || fail "public status shape unexpected"
pass "Public status endpoint"

APP_CODE="$(curl -fsS -o /dev/null -w '%{http_code}' "$APP_URL/")"
[[ "$APP_CODE" == "200" ]] || fail "APP_URL returned HTTP $APP_CODE (expected 200)"
pass "Frontend reachable"

if [[ -z "$SIGNUP_CODE" ]]; then
  echo "SKIP: signup (set SIGNUP_ACCESS_CODE to test authenticated flow)"
  echo ""
  echo "Smoke test finished with partial coverage."
  exit 0
fi

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

SIGNUP_BODY="$(cat <<EOF
{"email":"$SMOKE_USER","password":"$SMOKE_PASS","username":"smokeuser","accessCode":"$SIGNUP_CODE"}
EOF
)"

SIGNUP_CODE_HTTP="$(curl -fsS -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
  -X POST "$API_URL/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "$SIGNUP_BODY" 2>/dev/null)" || true

if [[ "$SIGNUP_CODE_HTTP" != "200" && "$SIGNUP_CODE_HTTP" != "201" ]]; then
  LOGIN_BODY="$(cat <<EOF
{"username":"smokeuser","password":"$SMOKE_PASS"}
EOF
)"
  LOGIN_CODE="$(curl -fsS -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
    -X POST "$API_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "$LOGIN_BODY")" || fail "login after signup skip"
  [[ "$LOGIN_CODE" == "200" ]] || fail "login HTTP $LOGIN_CODE"
  pass "Login with cookies"
else
  pass "Signup with cookies"
fi

SUMMARY_CODE="$(curl -fsS -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  "$API_URL/api/dashboard/summary")"
[[ "$SUMMARY_CODE" == "200" ]] || fail "dashboard summary HTTP $SUMMARY_CODE (cookie auth)"
pass "Authenticated dashboard summary"

LOGOUT_CODE="$(curl -fsS -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  -X POST "$API_URL/api/auth/logout")"
[[ "$LOGOUT_CODE" == "200" ]] || fail "logout HTTP $LOGOUT_CODE"
pass "Logout"

echo ""
echo "Smoke test passed."
