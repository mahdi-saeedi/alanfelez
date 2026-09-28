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
