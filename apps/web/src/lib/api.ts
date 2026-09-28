import "server-only";
import { headers } from "next/headers";
import { createApiClient } from "@alanfelez/api-client";
import { readSession } from "./session-refresh";

/**
 * Server-side API access. API_INTERNAL_URL points at the Go API from inside the network
 * (compose: http://api:8080, Kubernetes: http://alanfelez-api:8080).
 */
export const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/** Anonymous client: public data, safe to cache (Next data cache / CDN). */
export const api = createApiClient(API_URL);

/** The signed-in user's Keycloak access token, or undefined (anonymous, or the session could not be refreshed). */
export async function accessToken(): Promise<string | undefined> {
  const t = await readSession(await headers()).catch(() => null);
  if (!t?.accessToken || t.error) return undefined;
  if ((t.expiresAt ?? 0) <= Date.now() / 1000) return undefined; // the proxy refreshes before this happens
  return t.accessToken;
}

/**
 * Client for data that depends on the caller (tier-gated prices, entitlements). `personal` responses must not be
 * cached across users, so callers use `cache: "no-store"` then.
 */
export async function callerApi() {
  const token = await accessToken();
  return token ? { client: createApiClient(API_URL, token), personal: true } : { client: api, personal: false };
}
