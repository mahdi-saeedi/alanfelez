import { getTranslations } from "next-intl/server";
import { search } from "@/lib/search";

// Suggestions under the search box while typing (client, 2026-10-29): the first few results of the same search as
// /search, as JSON. Public data only (see lib/search.ts); the API reads behind it are cached, so typing is cheap.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80).trim();
  const locale = url.searchParams.get("locale") === "en" ? "en" : "fa";
  if (q.length < 2) return Response.json({ items: [], similar: false });
  const [tn, ts] = await Promise.all([getTranslations({ locale, namespace: "nav" }), getTranslations({ locale, namespace: "search" })]);
  const r = await search(locale, q, { page: (k) => tn(k), metalPrices: (metal) => ts("metalPrices", { metal }) });
  return Response.json({ items: r.items.slice(0, 6), similar: r.similar }, { headers: { "Cache-Control": "public, max-age=30" } });
}
