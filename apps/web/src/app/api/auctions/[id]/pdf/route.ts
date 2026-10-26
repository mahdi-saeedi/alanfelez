import { API_URL, accessToken } from "@/lib/api";

/**
 * An auction's PDF notice (Gold). The browser can't send the user's token itself, so this same-origin route adds it
 * server-side and passes the Go API's answer through; the API decides who may have the file (401/403 otherwise).
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const token = await accessToken();
  if (!token) return new Response(null, { status: 401 });
  let res: Response;
  try {
    res = await fetch(new URL(`/v1/auctions/${id}/pdf`, API_URL), {
      headers: { Authorization: `Bearer ${token}` },
      signal: req.signal,
      cache: "no-store",
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!res.ok || !res.body) return new Response(null, { status: [401, 403, 404].includes(res.status) ? res.status : 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": res.headers.get("Content-Disposition") ?? "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
