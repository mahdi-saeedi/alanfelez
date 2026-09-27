# Operations: Observability, Backups, Runbooks

> Status: **Proposed**. Stack decision: ADR-0015. Targets: [NFR.md](NFR.md).

## 1. Observability stack (self-hosted on ArvanCloud)
| Signal | Tool | Notes |
|---|---|---|
| Metrics | **Prometheus** (scrapes `/metrics` on api, worker, Caddy, Postgres exporter, Redis exporter, node exporter) | 30-day retention |
| Dashboards | **Grafana** | Dashboards are kept as JSON in `infra/grafana/` |
| Logs | **Loki** + Promtail (Docker log driver) | JSON logs (Go `slog`, Next.js pino). 30-day retention. **No PII** |
| Traces | **OpenTelemetry** SDK (Go + Next.js) → OTel Collector → **Tempo** | Phase 2+. Start with 10 % sampling, 100 % on errors |
| Errors | **GlitchTip** (Sentry-compatible) | Go + web + admin SDKs, with release tagging from CI |
| Uptime | Uptime Kuma (on a *separate* small server) + an external check | Alerts even if the main server is down |
| Product analytics | **Umami** (self-hosted, cookieless) | Page views, funnels (sign-up → subscribe), web-vitals |

Every log line and span carries `request_id`, `trace_id`, `user_id` (hashed) and `release`.

## 2. Key metrics (the "golden signals" + business)
| Metric | Why |
|---|---|
| `http_request_duration_seconds{route,status}` | PERF-2, error rate |
| `sse_connections` (gauge), `sse_messages_total` | PERF-3, capacity |
| `price_ingest_last_success_timestamp{source}` | Freshness (NFR §4) |
| `price_points_quarantined_total{source}` | Data quality |
| `otp_requests_total{result}`, `sms_cost_rial_total` | Abuse, budget |
| `payments_total{gateway,status}`, `payment_verify_duration_seconds` | Revenue path |
| `subscriptions_active{plan}` | Business health |
| River: `jobs_failed_total{kind}`, queue depth | Background health |
| Postgres: connections, replication/WAL archive lag, slow queries | DR-1, performance |

## 3. Alerts (→ Telegram/Bale bot + email to on-call)
| Alert | Condition | Severity | Runbook |
|---|---|---|---|
| SiteDown | Uptime check fails for 2 minutes | 🔴 page | R1 |
| HighErrorRate | 5xx > 2 % for 5 min | 🔴 | R2 |
| SourceStale | `now - last_success > stale_after` **during market hours** | 🟠 | R3 |
| PricesQuarantined | > 0 quarantined points for more than 15 min | 🟠 | R3 |
| OtpSpike / SmsBudget | OTP rate > 3× baseline, or daily spend > 80 % of budget | 🟠 / 🔴 at 100 % | R4 |
| PaymentFailures | verify failure rate > 10 % over 15 min, or reconciliation mismatch | 🔴 | R5 |
| BackupFailed | Nightly backup or WAL archiving hasn't succeeded for 24 h / 15 min | 🔴 | R6 |
| DiskHigh | > 80 % disk | 🟠 | R7 |
| CertExpiry | TLS certificate expires in < 14 days | 🟠 | R7 |

## 4. Runbooks
Keep each runbook short: symptoms → check → fix → verify → follow-up. Stored here and linked from the alerts.

- **R1 SiteDown:** check the Arvan CDN status → SSH, then `docker compose ps` → check the Caddy logs → restart the failed service → if the host is dead, go to DR (§5.3).
- **R2 HighErrorRate:** open Grafana (by route) → GlitchTip (new error after a deploy?) → **roll back** (re-deploy the previous tag) if it started with a release.
- **R3 SourceStale / Quarantined:** check the adapter's `source_runs.error` → is the upstream down, did its format change, or are credentials expired? → tell editors to use **manual entry** → fix the adapter → review the quarantined points in the admin.
- **R4 OTP / SMS:** find the top phones/IPs from the logs → tighten limits (settings) or turn on CAPTCHA for everyone → block the abusive ranges at the Arvan WAF → contact the SMS provider if the numbers are fraudulent.
- **R5 Payments:** check the gateway status page → match `payments` against the gateway panel → never mark paid manually without a gateway reference. Use the admin "grant subscription" with a reason (it's audit-logged).
- **R6 Backups:** re-run the backup job → check the Object Storage credentials and quota → confirm WAL archiving has resumed → the DR-1 RPO might be at risk, so raise it immediately.
- **R7 Disk / Cert:** prune images and logs (`docker system prune` of old images only) → extend the volume → check Caddy's ACME logs.

## 5. Backups & disaster recovery (NFR §5)
### 5.1 What gets backed up
| Item | How | Where |
|---|---|---|
| App Postgres (`market`, `app`) | **WAL archiving** (pgBackRest or wal-g) + a nightly full backup | Arvan Object Storage bucket `alanfelez-backups` (versioning on, separate credentials, lifecycle per DR-3) |
| Keycloak Postgres | Nightly `pg_dump` + realm export | Same bucket, `keycloak/` prefix |
| Uploaded media | Already in Object Storage. Versioning is on | — |
| Config & infra | Git (compose, Caddyfile, dashboards, realm export). Secrets in GitHub Environments | — |

### 5.2 Restore drill (quarterly, DR-4)
1. Provision a clean staging server from the compose files.
2. Restore the latest full backup + WAL to a target time (PITR).
3. Restore Keycloak.
4. Run the smoke tests.
5. Record the date, the duration (compare with RTO ≤ 4 h) and any issues in the log below.

| Date | Duration | Result | Notes |
|---|---|---|---|
| — | — | — | first drill before launch |

### 5.3 Full-site recovery (server lost)
New Arvan server → install Docker → clone the infra → write `.env` from GitHub Environments → restore Postgres (PITR) + Keycloak → `docker compose up -d` → point DNS/CDN → run the smoke tests → post-mortem.

## 6. Deploy operations
- Deploys come only from CI (ADR-0013). Production deploys happen **outside market hours**, preferably after 16:00 Tehran or on Thursday/Friday.
- Every release has a changelog entry (release-please) and a GlitchTip release.
- Migrations follow **expand → migrate → contract** across at least two releases, so rollback is always possible.
- A post-deploy smoke test covers the home, prices and chart pages in fa and en, the SSE connection, login redirect, and API health.

## 7. Incident process
- Severity: **SEV1** (site down or payments broken) · **SEV2** (a major feature is down, e.g. stale prices during market hours) · **SEV3** (minor).
- For SEV1/2, write a short **post-mortem** within 3 days (timeline, root cause, actions) in `docs/postmortems/YYYY-MM-DD-title.md`. Blameless.
