# ADR-0003: Next.js (App Router) as the public frontend only

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
SEO is essential: price pages, FAQ deep links and schema, news. The site is bilingual. The Figma prototype is React + Tailwind v4. Business logic belongs in Go.

## Decision
`apps/web` uses **Next.js App Router** with React Server Components. It holds **no business logic or database access**. Server components call the Go API through the generated client. Auth.js keeps the Keycloak session server-side and forwards the access token (BFF). **Tailwind v4** with the prototype tokens and **Radix UI** primitives. Browsers connect to the Go SSE endpoint directly for live prices.

## Consequences
Prototype markup ports almost 1:1, with good SEO and first paint. There's an extra network hop (web → api) on SSR, which is mitigated by caching/ISR for public data.

## Alternatives considered
Go-rendered HTML templates (weaker for a rich interactive UI), Vite SPA (poor SEO).
