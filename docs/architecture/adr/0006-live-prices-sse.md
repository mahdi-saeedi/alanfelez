# ADR-0006: Live prices via Server-Sent Events from Go, fanned out through Redis

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
Prices must update without reloading. Updates are one-way. Sources update from minutes to daily. Pages must also be server-rendered for SEO.

## Decision
The worker writes the latest prices to Redis and **PUBLISHes** changes. The Go API runs an **SSE hub** (`GET /v1/prices/stream`) that subscribes to Redis and fans out to connected clients. Next.js renders a snapshot first, and the browser `EventSource` patches it (auto-reconnect, `Last-Event-ID`, fallback to revalidation). Caddy streams the route without buffering.

## Consequences
Go handles many concurrent long-lived connections cheaply. It works over plain HTTP/CDN-friendly paths and scales horizontally through Redis. It's one-way only, which is fine here.

## Alternatives considered
WebSockets (bidirectional isn't needed), polling (wasteful and slower).
