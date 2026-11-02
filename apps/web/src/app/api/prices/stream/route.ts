import { API_URL, accessToken } from "@/lib/api";

/**
 * Same-origin live price stream. Browsers' EventSource can't send an Authorization header, so this route adds the
 * signed-in user's token server-side and passes the Go API's SSE stream through unchanged (tier filtering happens in Go).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Only this site's own pages (client, 2026-11-02: no other site or bot wired to the live prices). Browsers mark
  // their requests; a request from another site or a script without the mark gets nothing.
  if (req.headers.get("sec-fetch-site") !== "same-origin") return new Response(null, { status: 403 });
  const series = new URL(req.url).searchParams.get("series");
  const upstream = new URL("/v1/prices/stream", API_URL);
  if (series) upstream.searchParams.set("series", series);

  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: req.signal, // browser disconnects → upstream request is cancelled
      cache: "no-store",
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!res.ok || !res.body) {
    return new Response(null, { status: res.status === 401 ? 401 : 502 });
  }
  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
