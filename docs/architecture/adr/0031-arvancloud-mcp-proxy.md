# ADR-0031: ArvanCloud's MCP server through https://api.alanfelez.ir/mcp, with the caller's own key

- **Status:** Accepted (owner, 2026-11-07)
- **Date:** 2026-11-07

## Context
The owner wants to manage ArvanCloud (servers, storage, DNS) from Claude in the browser, through a claude.ai custom
connector. ArvanCloud's MCP server (`https://mcp.arvancloud.ir`) signs in with an `Arvancloud-Api-Key` header, but a
connector can't send that header (claude.ai answers "arvancloud-api-key is not supported"). The desktop app works only
because it runs `mcp-remote`, which adds the header locally.

## Decision
- The API serves `/mcp` (and `/mcp/*`) as a reverse proxy to `MCP_UPSTREAM` (default `https://mcp.arvancloud.ir`):
  `internal/mcpproxy`, mounted in `cmd/alanfelez/main.go` outside the OpenAPI contract (like the SSE stream).
  So the connector URL is `https://api.alanfelez.ir/mcp` (staging: `https://api.staging.alanfelez.ir/mcp`); no ingress change.
- **The caller brings its own key.** It sends its ArvanCloud API key as `api-key` (or `x-api-key`, or
  `Authorization: Bearer <key>`), and the proxy renames it to `Arvancloud-Api-Key`. **We store no key**: a request without
  one is answered 401 here and never reaches Arvan; a wrong key is refused by Arvan.
- `X-Mcp-Toolsets` is passed through when the caller sets it, otherwise `all` (the owner's choice: every tool,
  including deletes). Nothing else of ours goes upstream (cookies, forwarding headers). Responses stream as they arrive.
- Keys are never logged: the request log has method, path and status only.

## Consequences
- Anyone holding an ArvanCloud key with access to our account controls it through any MCP client, with or without this proxy.
  So the key in the connector is the thing to protect: a separate key for the connector, revoked in the Arvan panel when not needed.
- Anyone can use `/mcp` as a relay to `mcp.arvancloud.ir` with *their own* Arvan key. That gives them nothing of ours.
- Turning it off: `MCP_UPSTREAM=""` in the API's environment (`/mcp` then answers 404).
