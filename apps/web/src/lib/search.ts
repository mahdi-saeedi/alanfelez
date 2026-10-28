import "server-only";
import { cache } from "react";
import type { Schemas } from "@alanfelez/api-client";
import { api } from "./api";
import type { Locale } from "./prices";
import { MAIN_NAV, MORE_NAV } from "./nav";

/** Persian and Arabic letters compare the same (ی/ي, ک/ك), the half-space counts as a space, case doesn't matter. */
export function norm(s: string) {
  return s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌\s]+/g, " ").trim();
}

/** Every word of the query appears somewhere in the text (in any order). */
const matches = (words: string[], ...texts: (string | undefined)[]) => {
  const hay = norm(texts.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
};

/** How many of the newest articles the search looks through (the public list has no text search yet). */
const ARTICLES = 50;
const anon = (locale: Locale) => ({ params: { header: { "Accept-Language": locale } }, next: { revalidate: 60 } }) as const;

export type SearchResults = {
  products: Schemas["SeriesRef"][];
  metals: Schemas["Metal"][];
  articles: Schemas["ArticleSummary"][];
  faq: Schemas["FaqItem"][];
  pages: (readonly [string, string])[];
};

/**
 * Site search (client, 2026-10-28): products, metals, analyses, FAQ questions and the site's pages.
 * Everything is read anonymously, so a search never counts as using a paid feature and never sends locked data:
 * products are names only (a paid one's chart shows its own lock), articles are titles and summaries.
 * `pageName` gives a page's translated name, so "اشتراک" finds «اشتراک‌ها».
 */
export const search = cache(async (locale: Locale, q: string, pageName: (key: string) => string): Promise<SearchResults> => {
  const words = norm(q).split(" ").filter(Boolean);
  const [prices, metals, articles, faq] = await Promise.all([
    api.GET("/v1/prices", { params: { header: { "Accept-Language": locale }, query: {} }, next: { revalidate: 30 } }),
    api.GET("/v1/metals", anon(locale)),
    api.GET("/v1/articles", { params: { header: { "Accept-Language": locale }, query: { limit: ARTICLES } }, next: { revalidate: 60 } }),
    api.GET("/v1/faq", anon(locale)),
  ]);
  const series = [...(prices.data?.items.map((r) => r.series) ?? []), ...(prices.data?.lockedSeries ?? [])];
  return {
    products: series.filter((s) => matches(words, s.product.name, s.metal.name, s.category.name, s.market.name)),
    metals: (metals.data?.items ?? []).filter((m) => matches(words, m.name)),
    articles: (articles.data?.items ?? []).filter((a) => matches(words, a.title, a.summary, a.metal?.name)),
    faq: (faq.data?.categories ?? []).flatMap((c) => c.items).filter((i) => matches(words, i.question)),
    pages: [...MAIN_NAV, ...MORE_NAV].filter(([key]) => matches(words, pageName(key))),
  };
});
