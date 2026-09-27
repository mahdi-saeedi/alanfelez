# ADR-0011: Deploy with Docker Compose on ArvanCloud

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The client uses Iranian servers (ArvanCloud). Iranian payment gateways and SMS providers work best from Iranian IPs. **Docker Hub and some registries block Iranian IPs.** There's one developer.

## Decision
Images: `api` (Go, distroless; `api`, `worker` and `migrate` subcommands), `web` (Next.js standalone), `admin` (static build served by Caddy). They're built in CI and pushed to **ArvanCloud Container Registry**, which the servers pull from. Runtime is **Docker Compose** with **Caddy** (TLS, SSE-friendly), **Arvan CDN** in front, and **Arvan Object Storage** for uploads and nightly `pg_dump` backups. Base images are mirrored to the Arvan registry. Staging and production environments.

## Consequences
Simple, reproducible, cheap and easy to hand over. Scaling is vertical first. Kubernetes only if it's ever needed.

## Alternatives considered
Kubernetes now (overkill), building on the server (slow, needs registry and proxy access from Iran), foreign PaaS (IP/latency/gateway issues).
