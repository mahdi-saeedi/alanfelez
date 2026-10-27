import { headers } from "next/headers";
import { API_URL, accessToken } from "@/lib/api";

/**
 * Daily visitor count (admin «آمار بازدید»). The page sends a beacon here on every navigation; this route passes it to
 * the Go API with the visitor's forwarded IP, user agent and, when signed in, token. No cookie is set; the API stores
 * no IP (privacy page §4). Always 204, so a failed count never shows up in the browser.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "";
  const h = await headers();
  const pass: Record<string, string> = { "Content-Type": "application/json" };
  const forwarded = h.get("x-forwarded-for");
  const agent = h.get("user-agent");
  if (forwarded) pass["X-Forwarded-For"] = forwarded;
  if (agent) pass["User-Agent"] = agent.slice(0, 300);
  const token = await accessToken();
  if (token) pass.Authorization = `Bearer ${token}`;
  await fetch(new URL("/v1/visits", API_URL), { method: "POST", headers: pass, body: JSON.stringify({ path }), cache: "no-store" }).catch(() => null);
  return new Response(null, { status: 204 });
}
