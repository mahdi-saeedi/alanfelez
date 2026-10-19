# Rebuild everything from scratch

If the server is gone (deleted, broken, account lost), this brings the whole service back on a new ArvanCloud server in
**about an hour**. Almost everything is in GitHub; this page lists the few things that are not, and the steps.
Claude can do most of it: open the repo and say *"Rebuild the service on a new server, following docs/guides/REBUILD.md"*.
How the pieces fit: [DEPLOYMENT.md](DEPLOYMENT.md) §8.

## What lives where

| Thing | Where | If it's lost |
|---|---|---|
| Code, server setup (`deploy/server/bootstrap.sh`), cluster config, charts, encrypted secrets | GitHub | Nothing to do (GitHub is the source) |
| App images | ArvanCloud registry | Create a new registry; re-run the *Release* and *Mirror images* workflows (step 0) |
| **Sealed Secrets key** (decrypts the secrets in git) | Inside the cluster + **your offline backup** | Without the backup: make new secrets (step 6b); users are logged out, nothing else breaks |
| Registry login | GitHub secrets + typed on the server | Type it again (step 4) |
| Admin shared password | Sealed in git (needs the key) | Choose a new one (step 6b) |
| **Database** (users, orders, content edits) | The server's disk; backups to Object Storage once enabled | **Gone unless backups are on** (LAUNCH.md §2). Staging still runs without them |
| DNS records | ArvanCloud DNS | Point them at the new IP (step 2) |

**Do this today, and again after any key change:** save the Sealed Secrets key offline (a password manager, not GitHub,
not chat):

```bash
ssh root@<server> 'bash /root/alanfelez-server/server/bootstrap.sh backup-key' > sealed-secrets-key.yaml
```

## Steps

0. **Registry lost too?** Create a new one in ArvanCloud, set `REGISTRY_USERNAME`/`REGISTRY_PASSWORD` in GitHub
   (`gh secret set …`, type the values), replace the registry address in `.github/workflows/release.yml`,
   `.github/workflows/mirror-images.yml`, `deploy/environments/*/values.yaml`, `deploy/server/bin/set-registry-login`,
   push, then run *Mirror images* (Actions → Run workflow). The push itself runs *Release*.
1. **New server:** ArvanCloud → Cloud Server → Ubuntu 24.04 or newer, 4 CPU / 8–12 GB / 80 GB, your SSH key, firewall
   ports 22/80/443. Note the IP. Check: `ssh root@<ip> true`.
2. **DNS:** in ArvanCloud DNS set every A record to the new IP, Cloud off, TTL 2 minutes: `alanfelez.ir` `@ www api auth
   admin` and `alanfelez.com` `@ www` (and the staging names if a staging server exists).
3. **Base setup** (about 5 minutes):
   ```bash
   tar -czf - -C deploy server | ssh root@<ip> 'rm -rf /root/alanfelez-server && mkdir -p /root/alanfelez-server && tar -xzf - -C /root/alanfelez-server'
   ssh root@<ip> 'bash /root/alanfelez-server/server/bootstrap.sh base'
   ```
   If it prints a **NEW deploy key**, add it on GitHub as a read-only deploy key (repo Settings → Deploy keys; or
   `gh repo deploy-key add <file> --title argocd-<date>`), and remove the old server's key there.
4. **Registry login** (you type it): `ssh -t root@<ip> /root/set-registry-login.sh`
5. **Point git at the new server:** replace the old IP with the new one in `deploy/argocd/envs/staging/*.yaml`,
   `deploy/argocd/roots/root-staging.yaml` and `deploy/argocd/install/values-staging.yaml`; commit and push. Then fill
   the server's git copy (fast; the server's own download from GitHub can take long):
   ```bash
   git push ssh://root@<ip>/home/git/alanfelez.git origin/main:refs/heads/main
   ssh root@<ip> 'chown -R git:git /home/git/alanfelez.git'
   ```
6. **Secrets**, one of:
   - a. **You have the key backup:** **before** step 7, run
     `ssh root@<ip> 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl apply -f -' < sealed-secrets-key.yaml`.
     The sealed files in git then work as they are.
   - b. **No backup:** do step 7 first, wait until the `sealed-secrets` app is Healthy, then
     `ssh root@<ip> 'bash /root/alanfelez-server/server/bootstrap.sh reseal'` and `ssh -t root@<ip> /root/set-site-password.sh`;
     copy `/root/sealed/*.yaml` into `deploy/environments/staging/secrets/`, commit, push (step 5's push again).
7. **Argo CD** (about 10 minutes until everything is up):
   `ssh root@<ip> 'bash /root/alanfelez-server/server/bootstrap.sh argocd'`, then watch
   `ssh root@<ip> 'KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl -n argocd get applications'` until all are Synced/Healthy.
8. **Data:** with backups, restore the latest one (OPERATIONS.md §5). Without, the site starts with the initial data
   (and demo data on staging); staff accounts must be created again (`alanfelez-keycloak-admin`).
9. **Check:** `deploy/local/smoke.sh https://api.alanfelez.ir https://alanfelez.ir https://auth.alanfelez.ir`, open the
   site, sign in, open the admin. Update the server IP in `docs/guides/DEPLOYMENT.md` §8. Delete the old server.
