import { API_URL } from "@/lib/api";

/**
 * An article's picture (client, 2026-11-04): public like its title and summary, so no token. The API keeps it; this
 * same-origin route serves it, so the browser never talks to the API host. The article's coverUrl carries ?v= that
 * changes with each upload, so it may be cached for long.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  let res: Response;
  try {
    res = await fetch(new URL(`/v1/articles/${id}/image`, API_URL), { signal: req.signal, cache: "no-store" });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!res.ok || !res.body) return new Response(null, { status: res.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
