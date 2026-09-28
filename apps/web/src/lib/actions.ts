"use server";

import { signIn } from "@/auth";

/** Sends the user to Keycloak and back to `redirectTo` (a path on this site). */
export async function signInTo(redirectTo: string, locale: string) {
  await signIn("keycloak", { redirectTo: safePath(redirectTo) }, { ui_locales: locale });
}

/**
 * Keycloak "application initiated actions": the themed login pages let the user set a password or edit their
 * name, then come back (SCOPE §9: password login is optional and set from the account page).
 */
export async function keycloakAction(action: "UPDATE_PASSWORD" | "UPDATE_PROFILE", redirectTo: string, locale: string) {
  await signIn("keycloak", { redirectTo: safePath(redirectTo) }, { kc_action: action, ui_locales: locale });
}

// Only same-site paths, never absolute URLs (no open redirect).
function safePath(p: string): string {
  return p.startsWith("/") && !p.startsWith("//") ? p : "/";
}
