// Site-wide settings for SEO and routing (NFR SEO-1/2). Used by the proxy, layouts, sitemap and robots.

/** The public origin (canonical URLs, sitemap, Open Graph). SITE_URL wins; AUTH_URL is the same origin anyway. */
export const SITE_URL = (process.env.SITE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Only production is indexable: staging and local send `noindex` and robots.txt disallows everything, so a demo
 * environment never competes with the real site in search (set SITE_INDEXABLE=true in production values).
 */
export const INDEXABLE = process.env.SITE_INDEXABLE === "true";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

let cached: { english: boolean; at: number } | undefined;

/**
 * Whether the English site is public (flag locale.en, F4). Cached for a minute per process, since the proxy asks on
 * every /en request. If the API can't be reached the last answer is kept (or English is allowed), so an API
 * hiccup never hides pages.
 */
export async function englishEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 60_000) return cached.english;
  try {
    const res = await fetch(`${API_URL}/v1/site`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const site = (await res.json()) as { englishSite?: boolean };
      cached = { english: site.englishSite === true, at: Date.now() };
    }
  } catch {
    /* keep the previous answer */
  }
  return cached?.english ?? true;
}

/** Canonical and hreflang for a page path ("/faq"), for Next's metadata `alternates`. */
export function alternatesFor(locale: string, path: string, english: boolean) {
  const clean = path === "/" ? "" : path;
  const fa = `${SITE_URL}${clean || "/"}`;
  const en = `${SITE_URL}/en${clean}`;
  return {
    canonical: locale === "en" && english ? en : fa,
    languages: english ? { fa, en, "x-default": fa } : { fa, "x-default": fa },
  };
}
