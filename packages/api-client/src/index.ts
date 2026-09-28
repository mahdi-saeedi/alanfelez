import createClient from "openapi-fetch";
import type { paths } from "./schema";

export type { paths, components } from "./schema";

/** Typed client for the Go API. Types are generated from contracts/openapi.yaml (`pnpm generate`). */
export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}
