import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/site";

// Evaluated per request: whether a site is indexable is runtime config (SITE_INDEXABLE), not a build-time fact.
export const dynamic = "force-dynamic";

/** robots.txt (NFR SEO-2). Outside production everything is disallowed, so staging never gets indexed. */
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/checkout", "/en/account", "/en/checkout"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
