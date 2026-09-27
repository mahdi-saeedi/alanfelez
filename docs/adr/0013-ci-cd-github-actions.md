# ADR-0013: CI/CD with GitHub Actions, Arvan registry, staged deploys

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The lead developer wants CI/CD. A solo developer needs automated quality gates and safe, repeatable deploys to Iranian servers. Registries like Docker Hub are blocked from Iran, but GitHub-hosted runners (abroad) can reach both upstream registries and ArvanCloud.

## Decision
**GitHub Actions.** **CI on every PR:** golangci-lint, `go test -race` with testcontainers, govulncheck. ESLint, tsc, Vitest and builds for web/admin. sqlc/oapi-codegen/api-client **generate + git diff check**. OpenAPI lint + **oasdiff** breaking-change check. Playwright smoke tests (fa + en) against a compose stack. **gitleaks** and **Trivy**. **On merge to `main`:** build images (tag = git SHA), push to the Arvan Container Registry, and **auto-deploy to staging** over SSH (or a self-hosted runner on the server): migrate → `docker compose pull && up -d` → health checks → smoke tests. **On tag `vX.Y.Z`:** production deploy behind a **GitHub Environment manual approval**, with a DB backup before migrations. **Rollback** = redeploy the previous tag. Branch protection: PR + green CI required. **Renovate** for dependencies, **release-please** for versions and the changelog. Secrets live in GitHub Environments, never in git.

## Consequences
Every change is checked the same way and deploys are one click and reversible. The pipeline needs upkeep, and the Iranian server must accept SSH from GitHub runners (otherwise use a self-hosted runner on the server).

## Alternatives considered
GitLab CI (equivalent; switch if the team prefers GitLab), manual deploys (error-prone), CD straight to production without staging (risky).
