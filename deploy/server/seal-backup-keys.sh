#!/usr/bin/env bash
# Seal the ArvanCloud Object Storage keys for the database backups (secret alanfelez-backup-s3) without them ever
# appearing in a chat, a file or the shell history. The owner runs it on their own machine:
#
#   bash deploy/server/seal-backup-keys.sh
#
# It asks for the two keys (typing is hidden), sends them over SSH to the staging server's kubeseal, and writes the
# encrypted result to deploy/environments/{staging,production}/secrets/alanfelez-backup-s3.sealed.yaml. Both clusters
# share one Sealed Secrets key, so the same file works on both. Commit those two files (Claude can do it), then set
# postgres.backup.enabled: true in each data-values.yaml.
set -euo pipefail

SERVER="${SERVER:-root@37.32.39.49}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/alanfelez_arvan_ed25519}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

read -rsp "Access key (ACCESS_KEY_ID): " id; echo
read -rsp "Secret key (ACCESS_SECRET_KEY): " secret; echo
[ -n "$id" ] && [ -n "$secret" ] || { echo "Both keys are needed." >&2; exit 1; }

sealed="$(printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: alanfelez-backup-s3\n  namespace: alanfelez\ntype: Opaque\ndata:\n  ACCESS_KEY_ID: %s\n  ACCESS_SECRET_KEY: %s\n' \
    "$(printf %s "$id" | base64 | tr -d '\n')" "$(printf %s "$secret" | base64 | tr -d '\n')" \
  | ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" \
      'KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubeseal --controller-namespace kube-system -o yaml')"
unset id secret

grep -q 'kind: SealedSecret' <<< "$sealed" || { echo "Sealing failed." >&2; exit 1; }
for env in staging production; do
  printf '%s\n' "$sealed" > "$ROOT/deploy/environments/$env/secrets/alanfelez-backup-s3.sealed.yaml"
done
echo "Done: alanfelez-backup-s3.sealed.yaml written for staging and production (encrypted, safe to commit)."
