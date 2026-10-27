# production secrets (SealedSecrets only)

Encrypted with this cluster's Sealed Secrets key, so they're safe to commit. Create them with:

```bash
kubectl create secret generic alanfelez-app -n alanfelez --dry-run=client -o yaml \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 48)" \
  --from-literal=KC_WEB_CLIENT_SECRET="$(openssl rand -hex 32)" \
  | kubeseal --controller-namespace kube-system -o yaml > alanfelez-app.sealed.yaml
```

Required: `alanfelez-app`, `alanfelez-keycloak-admin` (username/password), `alanfelez-keycloak-db` (username=keycloak/password),
`alanfelez-backup-s3` (ACCESS_KEY_ID/ACCESS_SECRET_KEY), `arvan-registry` (dockerconfigjson). See docs/guides/DEPLOYMENT.md §3.

## Object Storage keys for the database backups (`alanfelez-backup-s3`)
The owner creates the bucket `alanfelez-backups` (private, versioning on) and an access key in the ArvanCloud panel, then
runs `bash deploy/server/seal-backup-keys.sh`: it asks for the two keys with hidden typing and writes this file for both
staging and production (one Sealed Secrets key on both clusters). After it's committed, set `postgres.backup.enabled: true`
in `../data-values.yaml`. Keys never go into a chat or git in plain text.

## Keycloak service account for the API (`alanfelez-keycloak-api-admin`)
Key `client-secret`: a random value nobody needs to know. The keycloak-profile job creates the client
`alanfelez-api-admin` (roles manage-users and view-users only) with this secret; the API uses it to delete users from the
admin. Made without anyone seeing it (to rotate, run again and commit; the next deploy applies it):

```bash
printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: alanfelez-keycloak-api-admin\n  namespace: alanfelez\ntype: Opaque\ndata:\n  client-secret: %s\n' \
  "$(openssl rand -hex 32 | tr -d '\n' | base64 | tr -d '\n')" \
  | ssh root@37.32.39.49 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubeseal --controller-namespace kube-system -o yaml' \
  > alanfelez-keycloak-api-admin.sealed.yaml
```
