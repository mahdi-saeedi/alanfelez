import type { AuthProvider } from "@refinedev/core";
import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { config } from "../config";

export const STAFF_ROLES = ["admin", "editor", "support"] as const;

/** OIDC Authorization Code + PKCE against Keycloak (ADR-0005). Tokens live in session storage only. */
export const userManager = new UserManager({
  authority: config.oidcAuthority,
  client_id: config.oidcClientId,
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: "code",
  scope: "openid profile",
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true,
});

/** Realm roles come from the "roles" claim of the access token (realm-roles mapper on the admin client). */
export function rolesOf(user: User | null): string[] {
  if (!user) return [];
  const payload = JSON.parse(atob(user.access_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as {
    roles?: string[];
  };
  return payload.roles ?? [];
}

export const isStaff = (user: User | null) => rolesOf(user).some((r) => (STAFF_ROLES as readonly string[]).includes(r));

export const authProvider: AuthProvider = {
  login: async () => {
    await userManager.signinRedirect({ extraQueryParams: { ui_locales: document.documentElement.lang || "fa" } });
    return { success: true };
  },
  logout: async () => {
    await userManager.signoutRedirect();
    return { success: true };
  },
  check: async () => {
    const user = await userManager.getUser();
    if (!user || user.expired) return { authenticated: false, redirectTo: "/login" };
    if (!isStaff(user)) return { authenticated: false, redirectTo: "/denied", logout: false };
    return { authenticated: true };
  },
  getIdentity: async () => {
    const user = await userManager.getUser();
    if (!user) return null;
    return { name: user.profile.preferred_username, roles: rolesOf(user) };
  },
  getPermissions: async () => rolesOf(await userManager.getUser()),
  onError: async (error: { status?: number }) => (error.status === 401 ? { logout: true } : {}),
};
