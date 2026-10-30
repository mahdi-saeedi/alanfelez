import { API_URL, accessToken } from "@/lib/api";

/**
 * A member's chart image (Silver and Gold), and its upload by the post's author. The browser can't send the user's
 * token itself, so this same-origin route adds it server-side; the API decides who may read or write (401/403/404).
 * Uploads come here rather than through a server action, whose body limit (1 MB) is smaller than a screenshot.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024;

async function forward(req: Request, id: string, init: RequestInit) {
  if (!UUID.test(id)) return null;
  const token = await accessToken();
  if (!token) return new Response(null, { status: 401 });
  try {
    return await fetch(new URL(`/v1/community/posts/${id}/image`, API_URL), {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: req.signal,
      cache: "no-store",
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const res = await forward(req, (await params).id, {});
  if (!res) return new Response(null, { status: 404 });
  if (!res.ok || !res.body) return new Response(null, { status: [401, 403, 404].includes(res.status) ? res.status : 502 });
  return new Response(res.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
  const res = await forward(req, (await params).id, { method: "PUT", body, headers: { "Content-Type": "application/octet-stream" } });
  if (!res) return new Response(null, { status: 404 });
  return new Response(null, { status: res.status === 204 ? 204 : [400, 401, 403, 404].includes(res.status) ? res.status : 502 });
}
