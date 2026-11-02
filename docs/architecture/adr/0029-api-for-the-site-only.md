# ADR-0029: The public API address serves Alan Felez only

- **Status:** Proposed (client asked 2026-11-02; owner OK needed: it changes who can reach the API)
- **Date:** 2026-11-02

## Context
The client doesn't mind people copying a price by hand, but no other site, channel bot or app may be wired to Alan
Felez and take its prices automatically. Until now `api.alanfelez.ir` answered anyone: anonymous callers got the free
prices (world and IME), and any script could poll them. The website never needs the public address: it renders on the
server and calls the API inside the cluster (`API_INTERNAL_URL`), and the browser's live prices come through the
website's own `/api/prices/stream`. Only the admin panel (a browser app) calls the public address, always as staff.

## Decision
- `API_SITE_ONLY` (chart value `api.siteOnly`, on by default; off in local Compose): on the host of `PUBLIC_URL`, every
  `/v1` request without a staff token gets 403 FORBIDDEN (`internal/api/siteonly.go`, after the token check). Calls by
  other host names (the website, in-cluster) and paths outside `/v1` (health checks, the mock payment page) are
  unaffected. Members' tokens never reach browsers (Auth.js keeps them server-side), so a member can't call it either.
- The website's `/api/prices/stream` only answers its own pages (`Sec-Fetch-Site: same-origin`).
- Bot protection on the website itself is Arvan's CDN/WAF setting (operations, not code).

## Consequences
- Pulling prices automatically now means scraping the website's pages, which is slower, breaks with any design change
  and can be throttled at the CDN; there is no longer a clean feed to hook.
- A load test of the API on staging or production must run inside the cluster (or with a staff token).
- If Alan Felez ever sells an API to customers, that becomes its own client with keys, not this address.
