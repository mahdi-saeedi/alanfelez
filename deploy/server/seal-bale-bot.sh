#!/usr/bin/env bash
# Connect the monitoring alerts to a Bale group, without the bot's token appearing in a chat, a file or the history.
# Before running it:
#   1. In Bale, open @botfather, create a bot (/newbot) and copy its token.
#   2. Make a Bale group (the owner and the developer), add the bot to it, and in the group send a message that
#      mentions the bot, e.g. "@<bot username> سلام".
# Then, on your own machine:
#
#   bash deploy/server/seal-bale-bot.sh
#
# It checks the token, finds the group's chat id, writes the encrypted token and the chat id for staging and production
# (deploy/observability/manifests/overlays/<env>/), and sends a test message to the group. Commit the result (Claude can).
set -euo pipefail

SERVER="${SERVER:-root@37.32.39.49}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/alanfelez_arvan_ed25519}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API="https://tapi.bale.ai"

read -rsp "Bale bot token (from @botfather): " token; echo
[ -n "$token" ] || { echo "No token." >&2; exit 1; }

me="$(curl -fsS -m 20 "$API/bot$token/getMe" || true)"
python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); sys.exit(0 if d.get("ok") else 1)' "$me" \
  || { echo "Bale did not accept this token (getMe failed)." >&2; exit 1; }
bot="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["result"].get("username",""))' "$me")"
echo "Bot: @$bot"

echo "Looking for the group (send a message mentioning @$bot in it if you haven't)…"
chat=""
for _ in $(seq 1 24); do
  upd="$(curl -fsS -m 20 "$API/bot$token/getUpdates" || true)"
  chat="$(python3 - "$upd" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1] or "{}")
except ValueError:
    sys.exit(0)
for u in reversed(d.get("result", [])):
    m = u.get("message") or u.get("channel_post") or u.get("my_chat_member") or {}
    c = m.get("chat") or {}
    if c.get("type") in ("group", "supergroup", "channel"):
        print(f'{c["id"]}\t{c.get("title", "")}')
        break
PY
)"
  [ -n "$chat" ] && break
  sleep 5
done
[ -n "$chat" ] || { echo "No group message found in 2 minutes. Mention the bot in the group and run this again." >&2; exit 1; }
chat_id="${chat%%$'\t'*}"; title="${chat#*$'\t'}"
read -rp "Send the alerts to the group «$title» ($chat_id)? [y/N] " ok
[ "$ok" = y ] || [ "$ok" = Y ] || exit 1

sealed="$(printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: alanfelez-bale\n  namespace: monitoring\ntype: Opaque\ndata:\n  bot-token: %s\n' \
    "$(printf %s "$token" | base64 | tr -d '\n')" \
  | ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" \
      'KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubeseal --controller-namespace kube-system -o yaml')"
grep -q 'kind: SealedSecret' <<< "$sealed" || { echo "Sealing failed." >&2; exit 1; }

for env in staging production; do
  dir="$ROOT/deploy/observability/manifests/overlays/$env"
  printf '%s\n' "$sealed" > "$dir/alanfelez-bale.sealed.yaml"
  python3 - "$dir/kustomization.yaml" "$chat_id" <<'PY'
import re, sys
path, chat = sys.argv[1], sys.argv[2]
s = open(path).read()
s = re.sub(r"(path: /spec/receivers/0/telegramConfigs/0/chatID\n\s+value: )-?\d+", r"\g<1>" + chat, s)
if "alanfelez-bale.sealed.yaml" not in s:
    s = s.replace("  - ../../base\n", "  - ../../base\n  - alanfelez-bale.sealed.yaml            # Bale bot token for the alerts (seal-bale-bot.sh)\n")
open(path, "w").write(s)
PY
done

curl -fsS -m 20 -o /dev/null "$API/bot$token/sendMessage" --data-urlencode "chat_id=$chat_id" \
  --data-urlencode "text=✅ هشدارهای مانیتورینگ الان‌فلز به این گروه وصل شد. (پیام آزمایشی)" \
  && echo "Test message sent to «$title»." || echo "Warning: the test message could not be sent." >&2
unset token
echo "Done: alanfelez-bale.sealed.yaml and the chat id are written for staging and production. Tell Claude to commit them."
