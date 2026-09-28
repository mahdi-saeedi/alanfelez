import { createApiClient, type Schemas } from "@alanfelez/api-client";
import { config } from "./config";
import { userManager, rolesOf } from "./providers/authProvider";

/** Typed API client for the admin pages: adds the staff token and the UI language to every request. */
export const api = createApiClient(config.apiUrl);
api.use({
  async onRequest({ request }) {
    const user = await userManager.getUser();
    if (user) request.headers.set("Authorization", `Bearer ${user.access_token}`);
    request.headers.set("Accept-Language", document.documentElement.lang || "fa");
    return request;
  },
});

export type Problem = Schemas["Problem"];

/** Throws the RFC 9457 problem of a failed call so react-query surfaces it. */
export function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.data !== undefined) return res.data;
  const p = (res.error ?? {}) as Partial<Problem>;
  throw Object.assign(new Error(p.detail ?? p.title ?? res.response.statusText), { problem: p, status: res.response.status });
}

/** A user-facing message for a failed call: translated from the problem code, never the developer `detail`. */
export function errorText(err: unknown, t: (key: string) => string): string {
  const code = problemOf(err)?.code;
  if (code) {
    const key = `error.${code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return (err as Error).message;
}

export function problemOf(err: unknown): Partial<Problem> | undefined {
  return (err as { problem?: Partial<Problem> } | null)?.problem;
}

/** Roles of the signed-in staff member (the API enforces them; the UI only hides what would be refused). */
export async function currentRoles(): Promise<string[]> {
  return rolesOf(await userManager.getUser());
}

export const canWritePrices = (roles: string[]) => roles.includes("editor") || roles.includes("admin");
export const canGrant = (roles: string[]) => roles.includes("admin");
