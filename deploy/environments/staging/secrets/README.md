# staging secrets (SealedSecrets only)

Encrypted with this cluster's Sealed Secrets key, so they're safe to commit. Create them with:

```bash
kubectl create secret generic alanfelez-app -n alanfelez --dry-run=client -o yaml \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 48)" \
  --from-literal=KC_WEB_CLIENT_SECRET="$(openssl rand -hex 32)" \
  | kubeseal --controller-namespace kube-system -o yaml > alanfelez-app.sealed.yaml
```

Required: `alanfelez-app`, `alanfelez-keycloak-admin` (username/password), `alanfelez-keycloak-db` (username=keycloak/password),
`alanfelez-backup-s3` (ACCESS_KEY_ID/ACCESS_SECRET_KEY), `arvan-registry` (dockerconfigjson), and on staging
`alanfelez-basic-auth` (below). Optional: `alanfelez-sms` (sms.ir, below). See docs/guides/DEPLOYMENT.md §3.

## Shared password for the test site (`alanfelez-basic-auth`)
Staging sets `ingress.basicAuth.enabled: true`, so the website and admin ask for a shared username and password first.
The owner creates it (choose the username; `htpasswd` asks for the password, so it never appears in the shell history):

```bash
htpasswd -nB alanfelez-team > /tmp/users && \
kubectl --context alanfelez-staging create secret generic alanfelez-basic-auth -n alanfelez --dry-run=client -o yaml \
  --from-file=users=/tmp/users \
  | kubeseal --context alanfelez-staging --controller-namespace kube-system -o yaml > alanfelez-basic-auth.sealed.yaml \
  && rm /tmp/users
```
Several people: one `htpasswd` line each in the same file. To change the password, re-create the file and commit it.

## sms.ir API key for sign-in codes (`alanfelez-sms`)
The client creates the key on the sms.ir panel (برنامه‌نویسان ← کلیدهای API) and gives it to the owner directly, never in
a chat or in git. `read -s` keeps it out of the shell history:

```bash
read -rs SMSIR_API_KEY && \
kubectl --context alanfelez-staging create secret generic alanfelez-sms -n alanfelez --dry-run=client -o yaml \
  --from-literal=SMSIR_API_KEY="$SMSIR_API_KEY" \
  | kubeseal --context alanfelez-staging --controller-namespace kube-system -o yaml > alanfelez-sms.sealed.yaml \
  && unset SMSIR_API_KEY
```
Then in `../values.yaml` set `keycloak.otp: {smsProvider: smsir, consoleAllowed: false, smsir: {templateId: "972517"}}` (the template id is already there).

## Object Storage keys for the database backups (`alanfelez-backup-s3`)
The owner creates the bucket `alanfelez-backups` (private, versioning on) and an access key in the ArvanCloud panel, then
runs `bash deploy/server/seal-backup-keys.sh`: it asks for the two keys with hidden typing and writes this file for both
staging and production (one Sealed Secrets key on both clusters). After it's committed, set `postgres.backup.enabled: true`
in `../data-values.yaml`. Keys never go into a chat or git in plain text.
