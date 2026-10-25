#!/usr/bin/env bash
# Copies the user profile (fields, who sees/edits them) from alanfelez-realm.json to a realm that already exists:
# Keycloak imports the realm file only once, so later profile changes have to be applied like this.
# Safe to run more than once. Run it BEFORE deploying code that relies on the new profile.
#
#   KC_URL=http://localhost:8081 KC_ADMIN=admin KC_ADMIN_PASSWORD=… ./apply-user-profile.sh
#   (staging/production: kubectl port-forward svc/alanfelez-keycloak 8081:8080, admin login from the
#    alanfelez-keycloak-admin secret; never paste the password into a chat)
set -euo pipefail
: "${KC_URL:?KC_URL}" "${KC_ADMIN:?KC_ADMIN}" "${KC_ADMIN_PASSWORD:?KC_ADMIN_PASSWORD}"
here="$(cd "$(dirname "$0")" && pwd)"
profile="$(python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); print(r["components"]["org.keycloak.userprofile.UserProfileProvider"][0]["config"]["kc.user.profile.config"][0])' "$here/alanfelez-realm.json")"
token="$(curl -fsS --data-urlencode "username=$KC_ADMIN" --data-urlencode "password=$KC_ADMIN_PASSWORD" \
  -d grant_type=password -d client_id=admin-cli "$KC_URL/realms/master/protocol/openid-connect/token" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
curl -fsS -X PUT -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data "$profile" \
  "$KC_URL/admin/realms/alanfelez/users/profile" >/dev/null
echo "user profile of realm alanfelez updated on $KC_URL"
