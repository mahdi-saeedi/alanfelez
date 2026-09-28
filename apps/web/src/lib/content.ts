import "server-only";
import { cache } from "react";
import type { Schemas } from "@alanfelez/api-client";
import { api, callerApi } from "./api";
import type { Locale } from "./prices";

export type ArticleSummary = Schemas["ArticleSummary"];
export type Article = Schemas["Article"];
export type ArticleType = Schemas["ArticleType"];
export type FaqCategory = Schemas["FaqCategory"];
export type Page = Schemas["Page"];
export type SiteInfo = Schemas["SiteInfo"];
export type Ticket = Schemas["Ticket"];
export type TicketThread = Schemas["TicketThread"];

/** CMS content changes rarely; anonymous reads are cached this long (seconds) by Next's data cache. */
const CONTENT_TTL = 60;

type ArticleQuery = { type?: ArticleType[]; category?: string; metal?: string; page?: number; limit?: number };

/**
 * Articles as the caller sees them: `locked` depends on the caller's plan, so signed-in reads are never cached.
 * Lists carry no bodies, so a list never counts as using a paid feature.
 */
export const getArticles = cache(async (locale: Locale, query: ArticleQuery = {}) => {
  const { client, personal } = await callerApi();
  const res = await client.GET("/v1/articles", {
    params: { header: { "Accept-Language": locale }, query },
    ...(personal ? { cache: "no-store" as const } : { next: { revalidate: CONTENT_TTL } }),
  });
  return res.data ?? null;
});

/** One article; `body` is present only when the caller's plan includes its type. null = not found. */
export const getArticle = cache(async (locale: Locale, slug: string): Promise<Article | null | undefined> => {
  const { client, personal } = await callerApi();
  const res = await client.GET("/v1/articles/{slug}", {
    params: { header: { "Accept-Language": locale }, path: { slug } },
    ...(personal ? { cache: "no-store" as const } : { next: { revalidate: CONTENT_TTL } }),
  });
  if (res.response.status === 404) return null;
  return res.data; // undefined = the API failed
});

const anon = (locale: Locale) => ({ params: { header: { "Accept-Language": locale } }, next: { revalidate: CONTENT_TTL } }) as const;

export const getArticleCategories = cache(async (locale: Locale) => (await api.GET("/v1/article-categories", anon(locale))).data?.items ?? []);

export const getMetals = cache(async (locale: Locale) => (await api.GET("/v1/metals", anon(locale))).data?.items ?? []);

export const getFaq = cache(async (locale: Locale) => (await api.GET("/v1/faq", anon(locale))).data?.categories ?? null);

/** A static page; null when it doesn't exist or isn't published, undefined when the API failed. */
export const getPage = cache(async (locale: Locale, slug: string): Promise<Page | null | undefined> => {
  const res = await api.GET("/v1/pages/{slug}", { params: { header: { "Accept-Language": locale }, path: { slug } }, next: { revalidate: CONTENT_TTL } });
  if (res.response.status === 404) return null;
  return res.data;
});

export const getSite = cache(async (locale: Locale): Promise<SiteInfo | null> => (await api.GET("/v1/site", anon(locale))).data ?? null);
