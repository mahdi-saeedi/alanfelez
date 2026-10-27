import type { MetadataRoute } from "next";
import { api } from "@/lib/api";
import { SITE_URL, englishEnabled } from "@/lib/site";

// Rendered on request, never at build time (it needs the API); the API calls below are cached for 10 minutes.
export const dynamic = "force-dynamic";

const PAGES = ["/", "/prices", "/chart", "/analysis", "/auctions", "/calculator", "/plans", "/faq", "/about", "/contact", "/terms", "/privacy"];

/**
 * sitemap.xml (NFR SEO-2): every public page, each metal's price page and published article, with the English alternate when the English
 * site is on. Locked analyses are listed too: their pages are public teasers (the body is never in the HTML).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const english = await englishEnabled();
  // If the API is unreachable, still answer with the fixed pages rather than failing.
  const site = await api.GET("/v1/site", { next: { revalidate: 600 } }).then((r) => r.data, () => undefined);
  const articles: { slug: string; publishedAt: string }[] = [];
  for (let page = 1; page <= 40; page++) { // up to 2,000 articles
    const res = await api.GET("/v1/articles", { params: { query: { limit: 50, page } }, next: { revalidate: 600 } }).then((r) => r.data, () => undefined);
    articles.push(...(res?.items ?? []));
    if (!res || page * res.limit >= res.total) break;
  }
  const metals = await api.GET("/v1/metals", { next: { revalidate: 600 } }).then((r) => r.data?.items ?? [], () => []);
  const paths = [...PAGES, ...metals.map((m) => `/prices/${m.slug}`), ...(site?.licensesPage ? ["/licenses"] : [])];
  const entry = (path: string, lastModified?: string): MetadataRoute.Sitemap[number] => {
    const clean = path === "/" ? "" : path;
    return {
      url: `${SITE_URL}${clean || "/"}`,
      ...(lastModified ? { lastModified } : {}),
      ...(english ? { alternates: { languages: { fa: `${SITE_URL}${clean || "/"}`, en: `${SITE_URL}/en${clean}` } } } : {}),
    };
  };
  return [...paths.map((p) => entry(p)), ...articles.map((a) => entry(`/analysis/${a.slug}`, a.publishedAt))];
}
