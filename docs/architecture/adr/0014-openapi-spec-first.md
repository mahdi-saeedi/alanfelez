# ADR-0014: Spec-first OpenAPI contract with generated Go and TypeScript code

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
A Go backend and two TypeScript frontends must agree on every request and response. Hand-written types drift and break silently.

## Decision
`contracts/openapi.yaml` (OpenAPI 3.1) is the single contract. **oapi-codegen** generates Go types and a strict server interface (implemented in handlers). **openapi-typescript + openapi-fetch** generate the typed TS client in `packages/api-client`. Request validation middleware runs from the spec. CI fails if generated code is stale or if a change is breaking without a version bump (**oasdiff**). Errors follow RFC 9457 problem JSON.

## Consequences
Type safety end to end, and the API docs come for free (Redoc/Scalar served in staging). Changes require editing YAML first, which is a small discipline.

## Alternatives considered
Code-first (Huma, swag annotations: the spec follows code and is easier to break unnoticed), gRPC/Connect (weaker browser/SSR ergonomics for this project).
