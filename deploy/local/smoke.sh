#!/usr/bin/env bash
# Smoke test for a running stack (compose or Kubernetes). Usage: smoke.sh <api-url> <web-url> <keycloak-url>
set -euo pipefail
API="${1:-http://localhost:8080}"; WEB="${2:-http://localhost:3000}"; KC="${3:-http://localhost:8081}"
fail() { echo "✗ $*"; exit 1; }
ok() { echo "✓ $*"; }

[ "$(curl -s "$API/readyz")" = '{"status":"ready"}' ] && ok "api ready" || fail "api /readyz"
curl -s "$API/v1/metals" | grep -q '"slug":"copper"' && ok "api metals (seed loaded)" || fail "api /v1/metals"
curl -s -H 'Accept-Language: en' "$API/v1/plans" | grep -q '"amount":"20000000"' && ok "api plans (gold 2,000,000 Toman)" || fail "api /v1/plans"
curl -s "$WEB/api/health" | grep -q '"ok"' && ok "web health" || fail "web /api/health"
curl -s "$WEB/" | grep -q 'هوشمندانه‌تر' && ok "web home (fa, SSR)" || fail "web home fa"
curl -s "$WEB/en/plans" | grep -q 'Gold' && ok "web plans (en, data from API)" || fail "web /en/plans"
curl -s "$KC/realms/alanfelez/.well-known/openid-configuration" | grep -q '"issuer"' && ok "keycloak realm" || fail "keycloak realm"
echo "All smoke checks passed."
