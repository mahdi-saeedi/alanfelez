import "server-only";
import { cache } from "react";
import { api } from "./api";
import type { Locale } from "./prices";
import { MAIN_NAV, MORE_NAV } from "./nav";

/** Persian and Arabic letters compare the same (ی/ي, ک/ك), the half-space counts as a space, case doesn't matter. */
export function norm(s: string) {
  return s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[‌\s]+/g, " ").trim();
}

export type SearchKind = "products" | "metals" | "articles" | "faq" | "pages";
/** One result: what it is, its name, a line under it, and where it leads. */
export type SearchItem = { kind: SearchKind; title: string; sub?: string; href: string };
/** `similar`: nothing matched exactly, so these are the closest names (a typo, another spelling). */
export type SearchResults = { items: SearchItem[]; similar: boolean };
/** Translated names the results need: a site page by its nav key, and «قیمت مس» for a metal. */
export type SearchLabels = { page: (key: string) => string; metalPrices: (metal: string) => string };

/** How many of the newest articles the search looks through (the public list has no text search yet). */
const ARTICLES = 50;
const anon = (locale: Locale) => ({ params: { header: { "Accept-Language": locale } }, next: { revalidate: 60 } }) as const;

/** Everything searchable, with the text each entry is matched on. */
const entries = cache(async (locale: Locale, labels: SearchLabels) => {
  const [prices, metals, articles, faq] = await Promise.all([
    api.GET("/v1/prices", { params: { header: { "Accept-Language": locale }, query: {} }, next: { revalidate: 30 } }),
    api.GET("/v1/metals", anon(locale)),
    api.GET("/v1/articles", { params: { header: { "Accept-Language": locale }, query: { limit: ARTICLES } }, next: { revalidate: 60 } }),
    api.GET("/v1/faq", anon(locale)),
  ]);
  const series = [...(prices.data?.items.map((r) => r.series) ?? []), ...(prices.data?.lockedSeries ?? [])];
  const all: (SearchItem & { text: string })[] = [
    ...series.map((s) => ({
      kind: "products" as const,
      title: s.product.name,
      sub: `${s.metal.name} · ${s.category.name} · ${s.market.name}`,
      href: `/chart?series=${encodeURIComponent(s.slug)}`,
      text: `${s.product.name} ${s.metal.name} ${s.category.name} ${s.market.name}`,
    })),
    ...(metals.data?.items ?? []).map((m) => ({ kind: "metals" as const, title: labels.metalPrices(m.name), href: `/prices/${m.slug}`, text: m.name })),
    ...(articles.data?.items ?? []).map((a) => ({ kind: "articles" as const, title: a.title, href: `/analysis/${a.slug}`, text: `${a.title} ${a.summary} ${a.metal?.name ?? ""}` })),
    ...(faq.data?.categories ?? []).flatMap((c) => c.items).map((i) => ({ kind: "faq" as const, title: i.question, href: `/faq#${i.slug}`, text: i.question })),
    ...[...MAIN_NAV, ...MORE_NAV].map(([key, href]) => ({ kind: "pages" as const, title: labels.page(key), href, text: labels.page(key) })),
  ];
  return all.map((e) => ({ ...e, text: norm(e.text) }));
});

/**
 * Site search (client, 2026-10-28): products, metals, analyses, FAQ questions and the site's pages.
 * Everything is read anonymously, so a search never counts as using a paid feature and never sends locked data:
 * products are names only (a paid one's chart shows its own lock), articles are titles and summaries.
 * Every word of the query must appear. When nothing does, the closest names are offered instead, marked as such
 * (client, 2026-10-29): «مص» finds «مس», «آلمینیوم» finds «آلومینیوم».
 */
export async function search(locale: Locale, q: string, labels: SearchLabels): Promise<SearchResults> {
  const words = norm(q).split(" ").filter(Boolean);
  const all = await entries(locale, labels);
  const exact = all.filter((e) => words.every((w) => e.text.includes(w)));
  if (exact.length) return { items: exact.map(strip), similar: false };
  const scored = all
    .map((e) => ({ e, score: closeness(words, e.text.split(" ")) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return { items: scored.slice(0, 8).map((s) => strip(s.e)), similar: true };
}

const strip = ({ text: _text, ...item }: SearchItem & { text: string }): SearchItem => item;

/**
 * How close the query is to an entry (0 = not close): every query word must be near some word of the entry, within a
 * few typos for its length (1 for short words like «مس», 2 up to 6 letters, 3 beyond). 1 = a perfect match.
 */
export function closeness(words: string[], tokens: string[]): number {
  let total = 0;
  for (const w of words) {
    const allowed = w.length <= 3 ? 1 : w.length <= 6 ? 2 : 3;
    let best = Infinity;
    for (const tok of tokens) {
      // A word the visitor hasn't finished typing counts as a match for its start.
      const d = tok.startsWith(w) ? 0 : levenshtein(w, tok);
      if (d < best) best = d;
    }
    if (best > allowed || best >= w.length) return 0;
    total += 1 - best / Math.max(w.length, 1);
  }
  return words.length ? total / words.length : 0;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}
