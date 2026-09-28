import "server-only";
import { createApiClient } from "@alanfelez/api-client";

/**
 * Server-side API client. API_INTERNAL_URL points at the Go API from inside the network
 * (compose: http://api:8080, Kubernetes: http://alanfelez-api:8080).
 */
export const api = createApiClient(process.env.API_INTERNAL_URL ?? "http://localhost:8080");
