import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type { paths, components } from "./schema";

/** Shorthands for the schemas the UIs use most. */
export type Schemas = components["schemas"];

/**
 * Typed client for the Go API. Types are generated from contracts/openapi.yaml (`task generate`).
 * Pass an access token for calls made on behalf of a signed-in user (server-side only).
 */
export function createApiClient(baseUrl: string, accessToken?: string) {
  return createClient<paths>({
    baseUrl,
    ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
  });
}
