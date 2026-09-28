import { NextRequest, type NextResponse } from "next/server";
import { encode, getToken, type JWT } from "next-auth/jwt";
import { keycloak, tokenEndpoint } from "./keycloak";

/**
 * Keeps the Keycloak access token in the Auth.js session cookie fresh.
 *
 * Why here (the proxy) and not in the Auth.js jwt callback: server components can't write cookies, and Keycloak
 * rotates refresh tokens (each one works once), so a refreshed token that isn't saved breaks the session. The proxy
 * refreshes shortly before expiry, writes the new cookie on the response AND on the forwarded request, so the page
 * rendered in the same request already sees the new token.
 *
 * Tokens stay in the encrypted, httpOnly cookie. They are never exposed to browser JavaScript.
 */

export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // Auth.js default
const REFRESH_BEFORE_S = 60;
const CHUNK_SIZE = 3936; // Auth.js: 4096 bytes minus the cookie's own overhead

const secure = (process.env.AUTH_URL ?? "").startsWith("https://");
export const sessionCookie = `${secure ? "__Secure-" : ""}authjs.session-token`;

export type SessionTokens = { accessToken?: string; refreshToken?: string; expiresAt?: number; error?: string };

/** Reads the decrypted session JWT from a request (handles chunked cookies). */
export function readSession(headers: Headers): Promise<(JWT & SessionTokens) | null> {
  return getToken({ req: { headers }, secret: process.env.AUTH_SECRET, secureCookie: secure, salt: sessionCookie }) as Promise<
    (JWT & SessionTokens) | null
  >;
}

export function needsRefresh(t: SessionTokens | null, nowS = Date.now() / 1000): boolean {
  return !!t?.refreshToken && !t.error && (t.expiresAt ?? 0) - REFRESH_BEFORE_S < nowS;
}

/** Exchanges a refresh token at Keycloak. Returns null when the Keycloak session has ended. */
export async function refreshTokens(refreshToken: string): Promise<SessionTokens | null> {
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: keycloak.clientId,
      client_secret: keycloak.clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
  };
}

type CookieWrite = { name: string; value: string; maxAge: number };

/**
 * Refreshes the session when needed. Returns the request to forward (with the new cookie) and a function that
 * copies the cookie changes onto the response; both are no-ops when nothing changed.
 */
export async function refreshSession(req: NextRequest): Promise<{ request: NextRequest; apply: (res: NextResponse) => NextResponse }> {
  const noop = { request: req, apply: (res: NextResponse) => res };
  const token = await readSession(req.headers).catch(() => null);
  if (!token || !needsRefresh(token)) return noop;

  const fresh = await refreshTokens(token.refreshToken as string).catch(() => null);
  // A failed refresh (Keycloak session over, token revoked) keeps the user signed in to the site but anonymous for
  // the API: the error flag stops further attempts and the header offers "login" again.
  const next: JWT = fresh ? { ...token, ...fresh, error: undefined } : { ...token, accessToken: undefined, error: "RefreshFailed" };
  const value = await encode({ token: next, secret: process.env.AUTH_SECRET as string, salt: sessionCookie, maxAge: SESSION_MAX_AGE });

  const writes = chunk(value);
  const existing = req.cookies.getAll().filter((c) => c.name === sessionCookie || c.name.startsWith(`${sessionCookie}.`));
  const deletes = existing.map((c) => c.name).filter((n) => !writes.some((w) => w.name === n));

  const headers = new Headers(req.headers);
  const jar = new Map(req.cookies.getAll().map((c) => [c.name, c.value]));
  deletes.forEach((n) => jar.delete(n));
  writes.forEach((w) => jar.set(w.name, w.value));
  headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));

  return {
    request: new NextRequest(req, { headers }),
    apply: (res) => {
      for (const w of writes) {
        res.cookies.set(w.name, w.value, { httpOnly: true, sameSite: "lax", path: "/", secure, maxAge: w.maxAge });
      }
      for (const n of deletes) res.cookies.delete(n);
      return res;
    },
  };
}

function chunk(value: string): CookieWrite[] {
  if (value.length <= CHUNK_SIZE) return [{ name: sessionCookie, value, maxAge: SESSION_MAX_AGE }];
  const out: CookieWrite[] = [];
  for (let i = 0; i * CHUNK_SIZE < value.length; i++) {
    out.push({ name: `${sessionCookie}.${i}`, value: value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), maxAge: SESSION_MAX_AGE });
  }
  return out;
}
