"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { keycloak, PASSWORD_FIRST, STAFF_ID_TOKEN_COOKIE } from "@/lib/keycloak";

/** «ورود»: sends the user to Keycloak's password page and back to `redirectTo` (a path on this site). */
export async function signInTo(redirectTo: string, locale: string) {
  await signIn("keycloak", { redirectTo: safePath(redirectTo) }, { ...PASSWORD_FIRST, ui_locales: locale });
}

/** «ثبت‌نام»: the mobile number + SMS code page, then the sign-up form (no PASSWORD_FIRST). */
export async function signUp(locale: string) {
  await signIn("keycloak", undefined, { ui_locales: locale });
}

/**
 * Keycloak "application initiated actions": the themed login pages let the user set a password or edit their
 * name, then come back (SCOPE §9: password login is optional and set from the account page).
 */
export async function keycloakAction(action: "UPDATE_PASSWORD" | "UPDATE_PROFILE", redirectTo: string, locale: string) {
  await signIn("keycloak", { redirectTo: safePath(redirectTo) }, { kc_action: action, ui_locales: locale });
}

/**
 * A staff account was turned away from the website (src/auth.ts): ends its Keycloak session, which the admin panel
 * shares, so that «ورود» asks for a mobile number instead of signing the staff account in again. With the ID token of
 * the refused sign-in Keycloak logs out without its "Do you want to log out?" page.
 */
export async function staffSignOut(locale: string) {
  const jar = await cookies();
  const idToken = jar.get(STAFF_ID_TOKEN_COOKIE)?.value;
  jar.delete(STAFF_ID_TOKEN_COOKIE);
  const url = new URL(`${keycloak.issuer}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", keycloak.clientId);
  url.searchParams.set("post_logout_redirect_uri", `${process.env.AUTH_URL ?? "http://localhost:3000"}${locale === "en" ? "/en" : "/"}`);
  if (idToken) url.searchParams.set("id_token_hint", idToken);
  redirect(url.toString());
}

// Only same-site paths, never absolute URLs (no open redirect).
function safePath(p: string): string {
  return p.startsWith("/") && !p.startsWith("//") ? p : "/";
}
