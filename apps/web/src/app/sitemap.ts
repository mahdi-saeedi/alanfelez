import type { MetadataRoute } from "next";
import { api } from "@/lib/api";
import { SITE_URL, englishEnabled } from "@/lib/site";

// Regenerated at most every 10 minutes (it lists articles).
export const revalidate = 600;

const PAGES = ["/", "/prices", "/chart", "/analysis", "/auctions", "/calculator", "/plans", "/faq", "/about", "/contact", "/terms", "/privacy"];

/**
 * sitemap.xml (NFR SEO-2): every public page and published article, with the English alternate when the English
 * site is on. Locked analyses are listed too: their pages are public teasers (the body is never in the HTML).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const english = await englishEnabled();
  const site = (await api.GET("/v1/site", { next: { revalidate: 600 } })).data;
  const articles = [];
  for (let page = 1; page <= 40; page++) { // up to 2,000 articles
    const res = (await api.GET("/v1/articles", { params: { query: { limit: 50, page } }, next: { revalidate: 600 } })).data;
    articles.push(...(res?.items ?? []));
    if (!res || page * res.limit >= res.total) break;
  }
  const paths = [...PAGES, ...(site?.licensesPage ? ["/licenses"] : [])];
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
