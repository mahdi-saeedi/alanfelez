# ADR-0015: Self-hosted observability: OpenTelemetry, Prometheus, Grafana, Loki, Tempo, GlitchTip

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
We need metrics, logs, traces, error tracking and alerting to meet the NFR targets and to operate as a solo developer. SaaS options (Datadog, Sentry cloud, Grafana Cloud) may be unreliable or unavailable from Iran, and they'd send user data abroad.

## Decision
Self-host on ArvanCloud: **Prometheus** (metrics) + **Grafana** (dashboards/alerts) + **Loki** (logs) + **Tempo** (traces, phase 2+), fed by **OpenTelemetry** SDKs in Go and Next.js via an OTel Collector. **GlitchTip** (Sentry-compatible) for errors. **Uptime Kuma** on a separate small server for external uptime checks. Alerts go to a Telegram/Bale bot and email. Dashboards and alert rules are versioned in `deploy/observability/`.

## Consequences
Full visibility and data stays in Iran. Using standard OTel means switching backends later is cheap. Cost: extra containers (~2 GB RAM) and upkeep. It can start minimal (Prometheus + Grafana + Loki + GlitchTip) and add Tempo later.

## Alternatives considered
SaaS observability (availability and data residency), logs only (not enough to meet the NFRs).
