// Minimal production server for the admin SPA: static files, SPA fallback, runtime /config.js from env,
// strict security headers. No dependencies (runs on the plain node image).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(import.meta.dirname, "dist");
const PORT = Number(process.env.PORT ?? 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon" };

const runtimeConfig = `window.__ADMIN_CONFIG__ = ${JSON.stringify({
  apiUrl: process.env.ADMIN_API_URL ?? "http://localhost:8080",
  oidcAuthority: process.env.ADMIN_OIDC_AUTHORITY ?? "http://localhost:8081/realms/alanfelez",
  oidcClientId: process.env.ADMIN_OIDC_CLIENT_ID ?? "alanfelez-admin",
})};\n`;

const connectSrc = [new URL(process.env.ADMIN_API_URL ?? "http://localhost:8080").origin,
  new URL(process.env.ADMIN_OIDC_AUTHORITY ?? "http://localhost:8081").origin].join(" ");
const https = (process.env.ADMIN_API_URL ?? "").startsWith("https://");
const SECURITY = {
  "Content-Security-Policy": [
    "default-src 'self'", "script-src 'self'", `connect-src 'self' ${connectSrc}`, "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'", "font-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'", ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-Robots-Tag": "noindex, nofollow", // staff only: never in search results
  ...(https ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/healthz") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ok"}');
  if (url.pathname === "/config.js") return res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store", ...SECURITY }).end(runtimeConfig);

  let file = normalize(join(ROOT, url.pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(400).end();
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch { file = join(ROOT, "index.html"); } // SPA fallback
  const hashed = url.pathname.startsWith("/assets/");
  const body = await readFile(file);
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache", ...SECURITY }).end(body);
}).listen(PORT, () => console.log(`admin listening on :${PORT}`));
