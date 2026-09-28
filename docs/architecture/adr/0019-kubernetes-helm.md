# ADR-0019: Staging and production on Kubernetes (k3s on ArvanCloud) with a Helm chart

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The lead developer wants Argo CD for continuous delivery (and possibly Kubernetes long-term). Argo CD only deploys to Kubernetes. Supersedes ADR-0011 (Docker Compose deploy). Local development stays on Docker Compose.

## Decision
Run staging and production on **Kubernetes**: a lightweight **k3s** cluster on ArvanCloud VMs (or Arvan managed Kubernetes). The application is packaged as one **Helm chart** (`deploy/helm/alanfelez`) with per-environment values (`deploy/environments/<env>/values.yaml`). Charts: `deploy/helm/alanfelez-data` (**CloudNativePG** `Cluster` with WAL archiving to Arvan Object Storage/PITR, a separate Keycloak `Database` + role, Redis StatefulSet) and `deploy/helm/alanfelez` (bootstrap PreSync job, Keycloak Deployment of our custom image with the realm baked in (`--import-realm`), api and web as Argo Rollouts, admin, Ingresses). Keycloak runs from our chart rather than the Keycloak Operator: one fewer operator, and the realm is versioned with the image. **Sealed Secrets** for secrets in git. Images: `api` (serve/migrate/seed/bootstrap), `keycloak`, `web`, `admin`. Probes: `/healthz` (liveness), `/readyz` (readiness).

## Consequences
Standard, declarative, reproducible environments. Rollouts, HPA and self-healing come built in, and Argo CD becomes possible. The cost is operating a cluster (k3s keeps it small) and some learning curve for a solo developer. Local development doesn't change (compose).

## Alternatives considered
Docker Compose on the VM (ADR-0011, superseded: no GitOps/Argo CD), managed PaaS abroad (availability and data residency).
