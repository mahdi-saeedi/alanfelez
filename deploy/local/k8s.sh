#!/usr/bin/env bash
# Local Kubernetes that behaves like staging/production: k3d (k3s) + Argo CD (GitOps) + Argo Rollouts + CloudNativePG.
#
#   deploy/local/k8s.sh up          create the cluster, Gitea, Argo CD, and register the root app
#   deploy/local/k8s.sh deploy      build images, import them, push a GitOps commit with the new tags (like CI)
#   deploy/local/k8s.sh deploy --broken   same, but the API can't reach Redis → canary analysis fails → automatic rollback
#   deploy/local/k8s.sh sync        push config/chart changes only (same image tags as the last deploy)
#   deploy/local/k8s.sh rollback    push a commit that restores the previously deployed version (like the Rollback workflow)
#   deploy/local/k8s.sh status      Argo CD apps, rollouts, pods
#   deploy/local/k8s.sh down        delete the cluster
#
# Safety: every kubectl/helm call uses --context k3d-alanfelez. Your current kube context is never changed.
set -euo pipefail

CLUSTER=alanfelez
CTX="k3d-${CLUSTER}"
K="kubectl --context ${CTX}"
H="helm --kube-context ${CTX}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HTTP_PORT="${K8S_HTTP_PORT:-8088}"
GITEA_USER=alanfelez
GITEA_PASS=local-gitea-pass
STATE_DIR="${ROOT}/deploy/local/.k8s-state"   # gitignored: deployed commit history for rollback
mkdir -p "${STATE_DIR}"

# Third-party images pre-pulled on the host and imported (the cluster doesn't need to download them).
PLATFORM_IMAGES=(
  quay.io/argoproj/argocd:v3.5.3
  quay.io/argoproj/argo-rollouts:v1.10.0
  ghcr.io/cloudnative-pg/cloudnative-pg:1.30.1
  ghcr.io/cloudnative-pg/postgresql:17
  public.ecr.aws/docker/library/redis:8-alpine
  gitea/gitea:1.27.3-rootless
)

log() { printf '\033[1;33m▶ %s\033[0m\n' "$*"; }

cmd_up() {
  if ! k3d cluster list "${CLUSTER}" >/dev/null 2>&1; then
    log "Creating k3d cluster ${CLUSTER} (http://*.alanfelez.localhost:${HTTP_PORT})"
    k3d cluster create "${CLUSTER}" --image rancher/k3s:v1.35.5-k3s1 \
      -p "${HTTP_PORT}:80@loadbalancer" --kubeconfig-update-default --kubeconfig-switch-context=false --wait
  fi
  log "Importing platform images"
  local present=()
  for img in "${PLATFORM_IMAGES[@]}"; do docker image inspect "$img" >/dev/null 2>&1 && present+=("$img"); done
  [ ${#present[@]} -gt 0 ] && k3d image import -c "${CLUSTER}" "${present[@]}"
  # Redis for the data chart uses the same image under its Docker Hub name.
  docker image inspect public.ecr.aws/docker/library/redis:8-alpine >/dev/null 2>&1 && {
    docker tag public.ecr.aws/docker/library/redis:8-alpine redis:8-alpine; k3d image import -c "${CLUSTER}" redis:8-alpine; }

  log "Gitea (in-cluster git server for Argo CD)"
  ${K} apply -f "${ROOT}/deploy/local/k8s/gitea.yaml"
  ${K} -n gitea rollout status deploy/gitea --timeout=180s
  ${K} -n gitea exec deploy/gitea -- gitea admin user create --admin --username "${GITEA_USER}" \
    --password "${GITEA_PASS}" --email admin@alanfelez.localhost --must-change-password=false >/dev/null 2>&1 || true

  log "Argo CD"
  helm repo add argo https://argoproj.github.io/argo-helm >/dev/null 2>&1 || true
  ${H} upgrade --install argocd argo/argo-cd --version 10.9.2 -n argocd --create-namespace \
    -f "${ROOT}/deploy/argocd/install/values-local.yaml" --wait --timeout 10m

  # First GitOps commit already carries real, imported image tags (never a tag that doesn't exist yet).
  cmd_deploy
  ${K} apply -f "${ROOT}/deploy/argocd/projects/alanfelez.yaml" -f "${ROOT}/deploy/argocd/roots/root-local.yaml"
  log "Done. Argo CD UI: http://argocd.alanfelez.localhost:${HTTP_PORT}  (admin / $(argocd_password))"
  log "Next: task k8s:status (sync takes a few minutes on first start)"
}

argocd_password() {
  ${K} -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || echo "?"
}

# Build a commit from the CURRENT working tree (tracked + untracked, minus ignored) with the given image tag
# written into deploy/environments/local/values.yaml, and push it to Gitea main. Doesn't touch your index or HEAD.
push_snapshot() {
  local message="$1" tag="${2:-}" redis="${3:-}"
  local idx; idx="$(mktemp)"; trap "rm -f '${idx}'" RETURN
  ( cd "${ROOT}"
    GIT_INDEX_FILE="$idx" git read-tree HEAD
    GIT_INDEX_FILE="$idx" git add -A
    if [ -n "${tag}" ]; then
      local values; values="$(sed -E "s/tag: local-[a-z0-9-]+/tag: ${tag}/" deploy/environments/local/values.yaml)"
      if [ -n "${redis}" ]; then values="${values/  seedProfiles: reference,demo/  seedProfiles: reference,demo
  redisUrl: ${redis}}"; fi
      local blob; blob="$(printf '%s\n' "${values}" | git hash-object -w --stdin)"
      GIT_INDEX_FILE="$idx" git update-index --cacheinfo "100644,${blob},deploy/environments/local/values.yaml"
    fi
    local tree commit parent
    tree="$(GIT_INDEX_FILE="$idx" git write-tree)"
    parent="$(cat "${STATE_DIR}/last-commit" 2>/dev/null || git rev-parse HEAD)"
    commit="$(git commit-tree "$tree" -p "$parent" -m "deploy(local): ${message}")"
    gitea_push "${commit}"
    [ -f "${STATE_DIR}/last-commit" ] && cp "${STATE_DIR}/last-commit" "${STATE_DIR}/previous-commit"
    echo "${commit}" > "${STATE_DIR}/last-commit"
    log "Pushed GitOps commit ${commit:0:10}: ${message}"
  )
  argo_refresh
}

# Ask Argo CD to look at git now (it otherwise polls every ~3 minutes).
argo_refresh() {
  local app
  for app in alanfelez-data alanfelez; do
    ${K} -n argocd annotate application "${app}" argocd.argoproj.io/refresh=normal --overwrite > /dev/null 2>&1 || true
  done
}

# Push a commit to Gitea main through a temporary port-forward, with retries (port-forward startup is racy).
gitea_push() {
  local commit="$1" pf attempt
  for attempt in 1 2 3 4 5; do
    ${K} -n gitea port-forward svc/gitea-http 13300:3000 >/dev/null 2>&1 & pf=$!
    sleep 2
    if git push -q --force "http://${GITEA_USER}:${GITEA_PASS}@localhost:13300/${GITEA_USER}/alanfelez.git" "${commit}:refs/heads/main"; then
      kill "$pf" 2>/dev/null || true; return 0
    fi
    kill "$pf" 2>/dev/null || true
    echo "push attempt ${attempt} failed, retrying…" >&2; sleep 2
  done
  echo "ERROR: could not push to Gitea" >&2; return 1
}

cmd_deploy() {
  local broken=""
  [ "${1:-}" = "--broken" ] && broken="redis://does-not-exist:6379/0"
  local tag="local-$(date +%H%M%S)"
  log "Building images (docker compose build) and tagging ${tag}"
  ( cd "${ROOT}" && docker compose build api keycloak web admin )
  for app in api keycloak web admin; do docker tag "alanfelez/${app}:local" "alanfelez/${app}:${tag}"; done
  k3d image import -c "${CLUSTER}" "alanfelez/api:${tag}" "alanfelez/keycloak:${tag}" "alanfelez/web:${tag}" "alanfelez/admin:${tag}"
  if [ -n "${broken}" ]; then
    push_snapshot "api ${tag} (BROKEN on purpose: Redis unreachable)" "${tag}" "${broken}"
  else
    push_snapshot "images ${tag}" "${tag}"
  fi
  echo "${tag}" > "${STATE_DIR}/last-tag"
  log "Argo CD syncs within ~30s. Watch: task k8s:status  |  kubectl --context ${CTX} argo rollouts get rollout alanfelez-api -n alanfelez -w"
}

cmd_sync() {
  local tag; tag="$(cat "${STATE_DIR}/last-tag" 2>/dev/null)" || { echo "Run deploy first"; exit 1; }
  push_snapshot "config (images ${tag})" "${tag}"
}

cmd_rollback() {
  local prev; prev="$(cat "${STATE_DIR}/previous-commit" 2>/dev/null)" || { echo "Nothing to roll back to"; exit 1; }
  ( cd "${ROOT}"
    local tree commit
    tree="$(git rev-parse "${prev}^{tree}")"
    commit="$(git commit-tree "$tree" -p "$(cat "${STATE_DIR}/last-commit")" -m "revert(local): roll back to ${prev:0:10}")"
    gitea_push "${commit}"
    cp "${STATE_DIR}/last-commit" "${STATE_DIR}/previous-commit"; echo "${commit}" > "${STATE_DIR}/last-commit"
    log "Pushed rollback commit ${commit:0:10} (restores ${prev:0:10})"
    argo_refresh
  )
}

cmd_status() {
  ${K} -n argocd get applications -o custom-columns='APP:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REVISION:.status.sync.revision' 2>/dev/null || true
  echo
  ${K} -n alanfelez get rollouts.argoproj.io -o custom-columns='ROLLOUT:.metadata.name,PHASE:.status.phase,STEP:.status.currentStepIndex,IMAGE:.spec.template.spec.containers[0].image,MSG:.status.message' 2>/dev/null || true
  echo
  ${K} -n alanfelez get pods -o wide 2>/dev/null | cut -c1-110 || true
}

cmd_down() { k3d cluster delete "${CLUSTER}"; rm -rf "${STATE_DIR}"; }

case "${1:-}" in
  up) cmd_up ;;
  deploy) shift; cmd_deploy "$@" ;;
  sync) cmd_sync ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  down) cmd_down ;;
  password) argocd_password ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
