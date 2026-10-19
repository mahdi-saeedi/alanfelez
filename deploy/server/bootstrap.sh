#!/usr/bin/env bash
# Turns a fresh ArvanCloud Ubuntu server (24.04 or newer) into an Alan Felez node. Safe to run again: every step checks
# first. Run as root on the server from a copy of deploy/server/ (docs/guides/REBUILD.md says how):
#
#   bash bootstrap.sh base          # OS, firewall, k3s, tools, helper commands, the in-Iran git copy
#   bash bootstrap.sh argocd ENV    # Argo CD + the root app for ENV = staging | production (after the git copy holds main)
#   bash bootstrap.sh reseal        # NEW random app secrets, sealed for this cluster, written to /root/sealed/
#   bash bootstrap.sh backup-key    # prints the Sealed Secrets key (keep it OFFLINE, e.g. a password manager)
#
# Everything comes from inside Iran where possible (international links are slow and vanish during shutdowns):
# docs/guides/DEPLOYMENT.md §8.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
K3S_VERSION="v1.36.5+k3s1"
HELM_VERSION="v3.17.3"
HELM_SHA256="ee88b3c851ae6466a3de507f7be73fe94d54cbf2987cbaa3d1a3832ea331f2cd"
KUBESEAL_VERSION="0.33.1"
KUBESEAL_SHA256="74b1f8fa1bc92fdf65fad34d5fbb72d6a2a2c954db9cec711704e2ebcba0a1af"
BARE=/home/git/alanfelez.git
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

step() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "Run as root."
node_ip() { ip -4 route get 1.1.1.1 | awk '{for (i=1;i<NF;i++) if ($i=="src") print $(i+1)}'; }

base() {
  step "DNS: domestic resolvers first (Shecan, Electro), foreign last"
  mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNS=178.22.122.100 78.157.42.100 1.1.1.1\nFallbackDNS=217.218.127.127 217.218.155.155\n' \
    > /etc/systemd/resolved.conf.d/alanfelez.conf
  systemctl restart systemd-resolved

  step "Ubuntu packages from the ArvanCloud mirror; time from ntp.day.ir"
  f=/etc/apt/sources.list.d/ubuntu.sources
  if [ -f "$f" ]; then
    [ -f "$f.orig" ] || cp "$f" "$f.orig"
    sed -i -E 's#http://[a-z.]*archive\.ubuntu\.com/ubuntu/?#https://mirror.arvancloud.ir/ubuntu/#; s#http://security\.ubuntu\.com/ubuntu/?#https://mirror.arvancloud.ir/ubuntu/#' "$f"
  fi
  mkdir -p /etc/systemd/timesyncd.conf.d
  printf '[Time]\nNTP=ntp.day.ir ir.pool.ntp.org\nFallbackNTP=ntp.ubuntu.com\n' > /etc/systemd/timesyncd.conf.d/alanfelez.conf
  systemctl restart systemd-timesyncd 2>/dev/null || true
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq apache2-utils dnsutils git curl python3 ufw >/dev/null

  step "Firewall: only 22, 80, 443 from outside"
  ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null; ufw default allow routed >/dev/null
  for p in 22 80 443; do ufw allow "$p/tcp" >/dev/null; done
  ufw allow from 10.42.0.0/16 >/dev/null; ufw allow from 10.43.0.0/16 >/dev/null   # k3s pods and services
  ufw --force enable >/dev/null

  step "k3s $K3S_VERSION (Traefik redirects HTTP → HTTPS)"
  mkdir -p /etc/rancher/k3s /var/lib/rancher/k3s/server/manifests
  install -m 600 "$HERE/traefik-config.yaml" /var/lib/rancher/k3s/server/manifests/traefik-config.yaml
  if [ ! -f /etc/rancher/k3s/registries.yaml ]; then
    # Until the registry login is set (set-registry-login): Docker Hub through the ArvanCloud mirror.
    printf 'mirrors:\n  docker.io:\n    endpoint:\n      - "https://docker.arvancloud.ir"\n' > /etc/rancher/k3s/registries.yaml
  fi
  if ! k3s --version 2>/dev/null | grep -q "${K3S_VERSION%%+*}"; then
    curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="$K3S_VERSION" sh -s - --write-kubeconfig-mode 600
  else note "already installed"; fi

  step "Helm $HELM_VERSION and kubeseal $KUBESEAL_VERSION (checksums verified)"
  if ! helm version --short 2>/dev/null | grep -q "$HELM_VERSION"; then
    t=$(mktemp -d); curl -sfL -o "$t/h.tgz" "https://get.helm.sh/helm-$HELM_VERSION-linux-amd64.tar.gz"
    echo "$HELM_SHA256  $t/h.tgz" | sha256sum -c --quiet; tar -xzf "$t/h.tgz" -C "$t"
    install -m 755 "$t/linux-amd64/helm" /usr/local/bin/helm; rm -rf "$t"
  fi
  if ! kubeseal --version 2>/dev/null | grep -q "$KUBESEAL_VERSION"; then
    t=$(mktemp -d); curl -sfL -o "$t/k.tgz" "https://github.com/bitnami-labs/sealed-secrets/releases/download/v$KUBESEAL_VERSION/kubeseal-$KUBESEAL_VERSION-linux-amd64.tar.gz"
    echo "$KUBESEAL_SHA256  $t/k.tgz" | sha256sum -c --quiet; tar -xzf "$t/k.tgz" -C "$t" kubeseal
    install -m 755 "$t/kubeseal" /usr/local/bin/kubeseal; rm -rf "$t"
  fi

  step "Helper commands (alanfelez-otp, alanfelez-keycloak-admin, set-registry-login, set-site-password)"
  install -m 755 "$HERE/bin/alanfelez-otp" "$HERE/bin/alanfelez-git-sync" /usr/local/bin/
  install -m 700 "$HERE/bin/alanfelez-keycloak-admin" /usr/local/bin/
  install -m 700 "$HERE/bin/set-registry-login" /root/set-registry-login.sh
  install -m 700 "$HERE/bin/set-site-password" /root/set-site-password.sh
  install -m 600 "$HERE/registries.yaml.example" /root/registries.yaml.example

  step "In-Iran git copy ($BARE), fetched from GitHub every minute"
  id git >/dev/null 2>&1 || useradd -m -s /usr/bin/git-shell git
  install -d -o git -g git -m 700 /home/git/.ssh
  [ -d "$BARE" ] || sudo -u git git init -q --bare "$BARE"
  git config --global --get-all safe.directory | grep -qx "$BARE" || git config --global --add safe.directory "$BARE"
  ssh-keyscan -t ed25519 github.com 2>/dev/null > /home/git/.ssh/known_hosts
  if [ ! -f /home/git/.ssh/github_deploy ]; then
    ssh-keygen -q -t ed25519 -N "" -C "argocd@alanfelez (read-only deploy key)" -f /home/git/.ssh/github_deploy
    NEW_KEY=1
  fi
  [ -f /home/git/.ssh/github_deploy.pub ] || ssh-keygen -y -f /home/git/.ssh/github_deploy > /home/git/.ssh/github_deploy.pub
  printf 'no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty %s\n' "$(cat /home/git/.ssh/github_deploy.pub)" \
    > /home/git/.ssh/authorized_keys
  chown -R git:git /home/git/.ssh; chmod 600 /home/git/.ssh/*; chmod 644 /home/git/.ssh/github_deploy.pub
  printf '[Unit]\nDescription=Fetch new commits from GitHub into the in-Iran git copy\n[Service]\nType=oneshot\nUser=git\nExecStart=/usr/local/bin/alanfelez-git-sync\n' \
    > /etc/systemd/system/alanfelez-git-sync.service
  printf '[Unit]\nDescription=Fetch from GitHub every minute\n[Timer]\nOnBootSec=1min\nOnUnitActiveSec=1min\n[Install]\nWantedBy=timers.target\n' \
    > /etc/systemd/system/alanfelez-git-sync.timer
  systemctl daemon-reload; systemctl enable --now alanfelez-git-sync.timer >/dev/null 2>&1

  step "Done. Next (docs/guides/REBUILD.md):"
  [ -n "${NEW_KEY:-}" ] && note "NEW deploy key: add it to GitHub as a READ-ONLY deploy key: $(cat /home/git/.ssh/github_deploy.pub)"
  note "1. registry login:   ssh -t root@$(node_ip) /root/set-registry-login.sh"
  note "2. fill the git copy (push from a developer machine, or wait for the timer once the deploy key is on GitHub)"
  note "3. bash bootstrap.sh argocd staging|production"
}

argocd_install() {
  env="${1:-}"; [ "$env" = staging ] || [ "$env" = production ] || die "Usage: bootstrap.sh argocd staging|production"
  git --git-dir="$BARE" rev-parse --verify -q main >/dev/null || die "The git copy has no 'main' yet (REBUILD.md step 5)."
  ip=$(node_ip)
  grep -q "ssh://git@$ip/" <(git --git-dir="$BARE" show "main:deploy/argocd/roots/root-$env.yaml") ||
    die "deploy/argocd/roots/root-$env.yaml on main doesn't point at this server ($ip). Update the IP in git first (REBUILD.md step 5)."
  t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
  git --git-dir="$BARE" archive main deploy/vendor/charts/argo-cd deploy/argocd | tar -x -C "$t"

  step "Argo CD (dashboard not public: reach it through an SSH tunnel)"
  kubectl get ns argocd >/dev/null 2>&1 || kubectl create ns argocd >/dev/null
  kubectl -n argocd create secret generic repo-alanfelez-iran --from-literal=type=git \
    --from-literal=url="ssh://git@$ip/home/git/alanfelez.git" --from-file=sshPrivateKey=/home/git/.ssh/github_deploy \
    --dry-run=client -o yaml | kubectl label --local -f - argocd.argoproj.io/secret-type=repository -o yaml | kubectl apply -f - >/dev/null
  known="$(ssh-keyscan -t ed25519 "$ip" 2>/dev/null | grep -v '^#')"
  helm upgrade --install argocd "$t/deploy/vendor/charts/argo-cd" -n argocd \
    -f "$t/deploy/argocd/install/values-cluster.yaml" -f "$t/deploy/argocd/install/values-$env.yaml" \
    --set-string "configs.ssh.extraHosts=$known" --wait --timeout 10m >/dev/null

  step "Root app: Argo CD now installs everything else from git"
  kubectl apply -f "$t/deploy/argocd/projects/alanfelez.yaml" -f "$t/deploy/argocd/roots/root-$env.yaml" >/dev/null
  note "Watch: kubectl -n argocd get applications   (all Synced/Healthy after ~10 minutes)"
}

reseal() {
  step "New random secrets, sealed for THIS cluster → /root/sealed/ (commit them to deploy/environments/staging/secrets/)"
  kubectl -n kube-system get pods -l app.kubernetes.io/name=sealed-secrets --no-headers 2>/dev/null | grep -q Running ||
    die "The Sealed Secrets controller isn't running yet (wait for Argo CD's sealed-secrets app)."
  umask 077; mkdir -p /root/sealed
  seal() { kubeseal --controller-namespace kube-system --controller-name sealed-secrets-controller -o yaml > "/root/sealed/$1.sealed.yaml"; }
  kubectl create secret generic alanfelez-app -n alanfelez --dry-run=client -o yaml \
    --from-literal=AUTH_SECRET="$(openssl rand -base64 48)" --from-literal=KC_WEB_CLIENT_SECRET="$(openssl rand -hex 32)" | seal alanfelez-app
  kubectl create secret generic alanfelez-keycloak-admin -n alanfelez --type=kubernetes.io/basic-auth --dry-run=client -o yaml \
    --from-literal=username=bootstrap-admin --from-literal=password="$(openssl rand -base64 24)" | seal alanfelez-keycloak-admin
  kubectl create secret generic alanfelez-keycloak-db -n alanfelez --type=kubernetes.io/basic-auth --dry-run=client -o yaml \
    --from-literal=username=keycloak --from-literal=password="$(openssl rand -hex 24)" | seal alanfelez-keycloak-db
  ls /root/sealed
  note "Then: /root/set-site-password.sh (the shared password) and commit /root/sealed/*.yaml to deploy/environments/<env>/secrets/"
}

case "${1:-}" in
  base) base ;;
  argocd) argocd_install "${2:-}" ;;
  reseal) reseal ;;
  backup-key) kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
