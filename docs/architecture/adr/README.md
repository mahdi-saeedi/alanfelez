# Architecture Decision Records

Format: see ADR-0001. Status is one of *Proposed*, *Accepted*, *Superseded by ADR-XXXX*.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-polyglot-monorepo.md) | Polyglot monorepo: Go backend, TypeScript frontends | Accepted |
| [0003](0003-nextjs-public-frontend.md) | Next.js (App Router) as the public frontend only | Accepted |
| [0004](0004-admin-refine-content-in-go.md) | Admin panel: Refine SPA on the Go API; content stored by Go (no separate CMS) | Accepted |
| [0005](0005-keycloak-identity.md) | Keycloak for identity; subscription tiers in the app database | Accepted |
| [0006](0006-live-prices-sse.md) | Live prices via Server-Sent Events from Go, fanned out through Redis | Accepted |
| [0007](0007-postgres-sqlc-goose-redis.md) | PostgreSQL with pgx + sqlc + goose; Redis for cache and pub/sub | Accepted |
| [0008](0008-background-jobs-river.md) | Background jobs with River (Postgres-backed queue) | Accepted |
| [0009](0009-i18n-fa-en.md) | Bilingual: Persian (default, RTL) and English | Accepted |
| [0010](0010-access-control-in-go.md) | Config-driven tier access control owned by Go, exposed as entitlements | Accepted |
| [0011](0011-deploy-docker-arvancloud.md) | Deploy with Docker Compose on ArvanCloud | Superseded by ADR-0019 |
| [0012](0012-provider-adapters.md) | Adapter interfaces for payments, SMS and data sources | Accepted |
| [0013](0013-ci-cd-github-actions.md) | CI/CD with GitHub Actions, Arvan registry, staged deploys | CI part accepted; deploy part superseded by ADR-0020 |
| [0014](0014-openapi-spec-first.md) | Spec-first OpenAPI contract with generated Go and TypeScript code | Accepted |
| [0015](0015-observability-stack.md) | Self-hosted observability: OpenTelemetry, Prometheus, Grafana, Loki, Tempo, GlitchTip | Accepted |
| [0016](0016-feature-flags.md) | Simple DB-backed feature flags | Accepted |
| [0017](0017-product-analytics-umami.md) | Cookieless self-hosted product analytics with Umami | Accepted |
| [0018](0018-developer-tooling.md) | Developer tooling: mise, Taskfile, lefthook, Renovate, release-please | Accepted |
| [0019](0019-kubernetes-helm.md) | Staging and production on Kubernetes (k3s on ArvanCloud) with a Helm chart | Accepted |
| [0020](0020-gitops-argocd-rollouts.md) | GitOps delivery with Argo CD, canary releases with Argo Rollouts, one-step rollback | Accepted |
| [0021](0021-bootstrap-and-seed-data.md) | Environments start from scratch: bootstrap job and config-driven seed data | Accepted |
| [0022](0022-keycloak-custom-image-otp-theme.md) | Custom Keycloak image: phone-OTP authenticator, pluggable SMS SPI, Keycloakify theme | Accepted |
| [0023](0023-web-tokens-and-live-stream.md) | Website token handling: refresh in the proxy, SSE through the website, federated logout | Accepted |
