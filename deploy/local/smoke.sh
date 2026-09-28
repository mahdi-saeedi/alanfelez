#!/usr/bin/env bash
# Smoke test for a running stack (compose or Kubernetes). Usage: smoke.sh <api-url> <web-url> <keycloak-url>
set -euo pipefail
API="${1:-http://localhost:8080}"; WEB="${2:-http://localhost:3000}"; KC="${3:-http://localhost:8081}"
fail() { echo "✗ $*"; exit 1; }
ok() { echo "✓ $*"; }

[ "$(curl -s "$API/readyz")" = '{"status":"ready"}' ] && ok "api ready" || fail "api /readyz"
curl -s "$API/v1/metals" | grep -q '"slug":"copper"' && ok "api metals (seed loaded)" || fail "api /v1/metals"
curl -s -H 'Accept-Language: en' "$API/v1/plans" | grep -q '"amount":"20000000"' && ok "api plans (gold 2,000,000 Toman)" || fail "api /v1/plans"
P="$(curl -s "$API/v1/prices")"
echo "$P" | grep -q '"lockedCount"' && ! echo "$P" | grep -q 'copper-lme' && ok "api prices (anonymous: base series only)" || fail "api /v1/prices"
{ curl -sN --max-time 3 "$API/v1/prices/stream" || true; } | grep -q '^retry:' && ok "api live price stream (SSE)" || fail "api /v1/prices/stream"
curl -s "$API/v1/faq" | grep -q '"slug":"what-is-alanfelez"' && ok "api faq (seeded from FAQ.docx)" || fail "api /v1/faq"
curl -s "$API/v1/pages/terms" | grep -q '"version"' && ok "api pages (terms)" || fail "api /v1/pages/terms"
curl -s "$API/v1/articles?type=analysis" | grep -q '"body"' && fail "api articles list must never carry bodies" || ok "api articles (no bodies in lists)"
curl -s "$WEB/api/health" | grep -q '"ok"' && ok "web health" || fail "web /api/health"
curl -s "$WEB/" | grep -q 'هوشمندانه‌تر' && ok "web home (fa, SSR)" || fail "web home fa"
curl -s "$WEB/en/plans" | grep -q 'Gold' && ok "web plans (en, data from API)" || fail "web /en/plans"
curl -s "$WEB/faq" | grep -q '"FAQPage"' && ok "web faq (FAQPage schema)" || fail "web /faq"
curl -s "$WEB/analysis" | grep -q 'اخبار و تحلیل بازار فلزات' && ok "web analysis" || fail "web /analysis"
curl -s "$KC/realms/alanfelez/.well-known/openid-configuration" | grep -q '"issuer"' && ok "keycloak realm" || fail "keycloak realm"
echo "All smoke checks passed."
