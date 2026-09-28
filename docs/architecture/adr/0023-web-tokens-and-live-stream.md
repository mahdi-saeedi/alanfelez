# ADR-0023: Website token handling: refresh in the proxy, SSE through the website, federated logout

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
M2 gates prices by tier, so the website must call the Go API with the signed-in user's Keycloak access token.
Three constraints shape how:
- Keycloak access tokens live 5 minutes and **refresh tokens rotate** (`revokeRefreshToken`: each one works once). A refreshed
  token that isn't saved breaks the session on the next refresh.
- Next.js **server components can't write cookies**, and Auth.js only persists its JWT from route handlers, server actions and the proxy.
- Browsers' **`EventSource` can't send an `Authorization` header**, and tokens must never reach browser JavaScript (ADR-0005).

## Decision
- Tokens (access, refresh, id) stay inside the **encrypted, httpOnly Auth.js session cookie**. The session object exposed to the
  browser never contains them.
- The **Next.js proxy** (`apps/web/src/proxy.ts`, `src/lib/session-refresh.ts`) refreshes the token 60 s before expiry, writes the new
  cookie on the response **and on the forwarded request**, so the page rendered in the same request already uses the new token.
  If Keycloak refuses (session over), the session is flagged and the site behaves as anonymous until the user signs in again.
- Server code reads the token with `accessToken()` (`src/lib/api.ts`). Personalized API responses are never cached across users.
- Live prices go **browser → `/api/prices/stream` (website) → Go `/v1/prices/stream`**: the website route adds the token
  server-side and streams the SSE body through. Tier filtering stays in Go.
- **Logout ends the Keycloak session too** (`end_session` with `id_token_hint`), so "login" on a shared computer doesn't silently
  sign the previous person back in.

## Consequences
One extra hop for the stream (cheap: the website only pipes bytes). The session cookie is larger (it may be split into chunks, which
the refresh code handles). Token logic lives in one place (`session-refresh.ts`), which is small enough to reason about.

## Alternatives considered
Token in the SSE query string (leaks into logs), exposing tokens to the browser (XSS risk), refreshing in the Auth.js `jwt`
callback only (not persisted from server components, and breaks with rotating refresh tokens), a server-side session store (extra
infrastructure for one feature).
