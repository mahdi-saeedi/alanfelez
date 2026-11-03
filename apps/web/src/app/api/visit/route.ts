import { headers } from "next/headers";
import { API_URL, accessToken } from "@/lib/api";

/**
 * Visitor stats (admin «آمار بازدید») and signed-in users' activity (admin «رفتار کاربران»). The page sends a beacon
 * here on every navigation, and again with the seconds it was in view when it's hidden or left; this route passes it
 * to the Go API with the visitor's forwarded IP, user agent and, when signed in, token. No cookie is set; the API
 * stores no IP (privacy page). Always 204, so a failed count never shows up in the browser.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { path?: unknown; view?: unknown; seconds?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "";
  const out: { path: string; view?: string; seconds?: number } = { path };
  if (typeof body?.view === "string" && UUID.test(body.view)) out.view = body.view;
  if (typeof body?.seconds === "number" && Number.isFinite(body.seconds)) {
    out.seconds = Math.min(1800, Math.max(1, Math.round(body.seconds)));
  }
  const h = await headers();
  const pass: Record<string, string> = { "Content-Type": "application/json" };
  const forwarded = h.get("x-forwarded-for");
  const agent = h.get("user-agent");
  if (forwarded) pass["X-Forwarded-For"] = forwarded;
  if (agent) pass["User-Agent"] = agent.slice(0, 300);
  const token = await accessToken();
  if (token) pass.Authorization = `Bearer ${token}`;
  await fetch(new URL("/v1/visits", API_URL), { method: "POST", headers: pass, body: JSON.stringify(out), cache: "no-store" }).catch(() => null);
  return new Response(null, { status: 204 });
}
