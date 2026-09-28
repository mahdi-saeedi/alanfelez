import "server-only";
import { cache } from "react";
import type { Schemas } from "@alanfelez/api-client";
import { callerApi } from "./api";

export type PriceRow = Schemas["PriceRow"];
export type PriceList = Schemas["PriceList"];
export type Entitlements = Schemas["Entitlements"];
export type Locale = "fa" | "en";

/** Latest prices the caller may see (deduplicated per request). Anonymous responses are cached for 5 s. */
export const getPrices = cache(async (locale: Locale, metal?: string, category?: string, market?: string): Promise<PriceList | null> => {
  const { client, personal } = await callerApi();
  const res = await client.GET("/v1/prices", {
    params: { header: { "Accept-Language": locale }, query: { metal, category, market } },
    ...(personal ? { cache: "no-store" as const } : { next: { revalidate: 5 } }),
  });
  return res.data ?? null;
});

/** The caller's tier and features (never cached across users). */
export const getEntitlements = cache(async (): Promise<Entitlements | null> => {
  const { client } = await callerApi();
  const res = await client.GET("/v1/me/entitlements", { cache: "no-store" });
  return res.data ?? null;
});

/** History of one series. A 403 comes back as `locked` with the plan that unlocks it. */
export const getHistory = cache(async (locale: Locale, slug: string, range: Schemas["ChartRange"]) => {
  const { client, personal } = await callerApi();
  const res = await client.GET("/v1/series/{slug}/points", {
    params: { header: { "Accept-Language": locale }, path: { slug }, query: { range } },
    ...(personal ? { cache: "no-store" as const } : { next: { revalidate: 30 } }),
  });
  if (res.data) return { data: res.data } as const;
  const err = res.error as Schemas["Problem"] | undefined;
  if (res.response.status === 403 && err?.code === "FEATURE_LOCKED") {
    return { locked: { feature: err.feature ?? "", plan: err.requiredPlan ?? "silver" } } as const;
  }
  return { error: res.response.status } as const;
});
