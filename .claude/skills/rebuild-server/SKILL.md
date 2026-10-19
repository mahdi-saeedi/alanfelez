---
name: rebuild-server
description: Rebuild the whole service on a new ArvanCloud server (server lost, moving servers, disaster recovery), or set up an extra one. Use when asked to restore, rebuild, migrate or set up a server from scratch.
---

# Rebuild the service on a new server

Follow `docs/guides/REBUILD.md` step by step; background in `docs/guides/DEPLOYMENT.md` §8 and `deploy/CLAUDE.md`.

- Ask the user for the new server's IP and which SSH key logs in. Check with `ssh -o BatchMode=yes root@<ip> true`.
- The user does the steps that need their accounts or secrets: creating the server, DNS records, GitHub secrets,
  `set-registry-login` and `set-site-password` (they type the values). Never ask them to paste a password, token or
  private key into the chat; give them the command and let them run it.
- Everything else you run: `bootstrap.sh base`, the IP change in git (commit + push), filling the server's git copy,
  `bootstrap.sh argocd`, `reseal` if there is no Sealed Secrets key backup, then the checks in step 9.
- Say clearly what was lost: without database backups (Object Storage), user data cannot be recovered.
- Servers in Iran reach the international internet slowly or not at all: never download big files on the server when
  the developer machine can fetch and `scp` them; images come only from the ArvanCloud registry.
- Afterwards update the server IP and date in `docs/guides/DEPLOYMENT.md` §8, and remind the user to save a fresh
  Sealed Secrets key backup (`bootstrap.sh backup-key`) offline.
