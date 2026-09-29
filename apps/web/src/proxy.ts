import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { refreshSession } from "./lib/session-refresh";
import { contentSecurityPolicy, newNonce, withSecurityHeaders } from "./lib/security-headers";
import { englishEnabled } from "./lib/site";

const intl = createMiddleware(routing);

/**
 * Next.js 16 "proxy" (formerly middleware):
 *  1. keeps the Keycloak access token in the session cookie fresh (src/lib/session-refresh.ts)
 *  2. /en while the English site is off (flag locale.en) → the same page in Persian
 *  3. locale routing (next-intl) for pages
 *  4. security headers, with a per-request CSP nonce for pages (src/lib/security-headers.ts)
 */
export default async function proxy(req: NextRequest) {
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
