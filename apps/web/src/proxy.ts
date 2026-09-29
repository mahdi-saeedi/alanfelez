import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { refreshSession } from "./lib/session-refresh";
import { contentSecurityPolicy, newNonce, withSecurityHeaders } from "./lib/security-headers";
import { SITE_URL, englishEnabled } from "./lib/site";

const intl = createMiddleware(routing);
// Only when the address is configured (every environment sets it; a bare `next dev` doesn't, and then any host works).
const SITE = process.env.SITE_URL || process.env.AUTH_URL ? new URL(SITE_URL) : undefined;

/**
 * Next.js 16 "proxy" (formerly middleware):
 *  0. any other host name (127.0.0.1, www., an IP) → the site's own address, before anything else
 *  1. keeps the Keycloak access token in the session cookie fresh (src/lib/session-refresh.ts)
 *  2. /en while the English site is off (flag locale.en) → the same page in Persian
 *  3. locale routing (next-intl) for pages
 *  4. security headers, with a per-request CSP nonce for pages (src/lib/security-headers.ts)
 */
export default async function proxy(req: NextRequest) {
  // Sign-in cookies belong to the host name the visitor used, but Keycloak always returns to SITE_URL (AUTH_URL).
  // Starting on another name (127.0.0.1 instead of localhost, www.…) made the return fail with Auth.js's
  // "Server error / Configuration" (InvalidCheck: pkceCodeVerifier). So pages only answer on the site's own host.
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0]?.trim();
  if (SITE && host && host !== SITE.host) {
    return withSecurityHeaders(NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, SITE_URL), 308));
  }
  const { request, apply } = await refreshSession(req);
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    return withSecurityHeaders(apply(NextResponse.next({ request: { headers: request.headers } })));
  }
  if ((path === "/en" || path.startsWith("/en/")) && !(await englishEnabled())) {
    const url = request.nextUrl.clone();
    url.pathname = path.slice(3) || "/";
    return withSecurityHeaders(apply(NextResponse.redirect(url, 307)));
  }
  // Next reads the nonce from the request's CSP header and puts it on its own scripts.
  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  return withSecurityHeaders(apply(intl(new NextRequest(request, { headers }))), csp);
}

export const config = {
  // Pages (everything without a file extension, except Next internals) plus the API routes that call the Go API
  // with the user's token. /api/auth is left to Auth.js.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/prices/:path*"],
};
