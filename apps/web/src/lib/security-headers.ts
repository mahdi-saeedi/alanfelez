import type { NextResponse } from "next/server";
import { keycloak } from "./keycloak";
import { INDEXABLE, SITE_URL } from "./site";

// Where a form (or the redirect after it) may go besides this site: Keycloak (login, profile, password) and the
// payment gateway page (CSP_FORM_ORIGINS, comma-separated; the mock gateway locally, the real one in production).
const formOrigins = [new URL(keycloak.issuer).origin, ...(process.env.CSP_FORM_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];

const https = SITE_URL.startsWith("https://");
const dev = process.env.NODE_ENV === "development";

/** A fresh nonce per request (Next adds it to its own scripts; our JSON-LD blocks read it from `x-nonce`). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Content-Security-Policy (SECURITY T6): scripts only with this request's nonce ('strict-dynamic' lets Next's chunk
 * loader add more), no plugins, no framing, no foreign fonts or connections (NFR: nothing loads from abroad at runtime).
 * Styles allow inline because React style attributes (chart colors, metal tones) need it; that's not a script path.
 * Images allow https for CMS cover URLs until media uploads exist.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${formOrigins.join(" ")}`,
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** The rest of the security headers (SECURITY §8), plus noindex outside production. */
export function withSecurityHeaders(res: NextResponse, csp?: string): NextResponse {
  const h = res.headers;
  if (csp) h.set("Content-Security-Policy", csp);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  if (https) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (!INDEXABLE) h.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
