import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { refreshSession } from "./lib/session-refresh";

const intl = createMiddleware(routing);

/**
 * Next.js 16 "proxy" (formerly middleware):
 *  1. keeps the Keycloak access token in the session cookie fresh (src/lib/session-refresh.ts)
 *  2. locale routing (next-intl) for pages
 */
export default async function proxy(req: NextRequest) {
  const { request, apply } = await refreshSession(req);
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return apply(NextResponse.next({ request: { headers: request.headers } }));
  }
  return apply(intl(request));
}

export const config = {
  // Pages (everything without a file extension, except Next internals) plus the API routes that call the Go API
  // with the user's token. /api/auth is left to Auth.js.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/prices/:path*"],
};
