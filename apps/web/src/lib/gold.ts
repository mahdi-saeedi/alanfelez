import "server-only";
import type { Schemas } from "@alanfelez/api-client";
import { callerApi } from "./api";
import type { Locale } from "./prices";

export type AuctionList = Schemas["AuctionList"];
export type Auction = Schemas["Auction"];
export type CalculatorInput = Schemas["CalculatorInput"];
export type CalculatorResult = Schemas["CalculatorResult"];
export type SavedCalculation = Schemas["SavedCalculation"];
export type PriceAlert = Schemas["PriceAlert"];
export type PriceAlertInput = Schemas["PriceAlertInput"];

type Problem = Schemas["Problem"];

/**
 * Gold features (SCOPE §7, §8, #19). Every response depends on the caller's plan, so nothing here is cached.
 * Locked answers come back as data (`locked`) or as a FEATURE_LOCKED problem; the API never sends locked rows.
 */
/** Metal auctions: the Gold fields are only in the answer when the caller has Gold. */
export async function getAuctions(
  locale: Locale,
  query: { metal?: string; category?: Schemas["AuctionCategory"]; status?: Schemas["AuctionStatus"]; limit?: number; offset?: number },
): Promise<AuctionList | null> {
  const { client } = await callerApi();
  const res = await client.GET("/v1/auctions", { params: { header: { "Accept-Language": locale }, query }, cache: "no-store" });
  return res.data ?? null;
}

export async function estimate(input: CalculatorInput): Promise<{ result?: CalculatorResult; status: number; code?: string }> {
  const { client } = await callerApi();
  const res = await client.POST("/v1/calculator/estimate", { body: input, cache: "no-store" });
  return { result: res.data, status: res.response.status, code: (res.error as Problem | undefined)?.code };
}

async function signedIn() {
  const c = await callerApi();
  return c.personal ? c.client : null;
}

export async function getMyCalculations(): Promise<SavedCalculation[]> {
  const client = await signedIn();
  if (!client) return [];
  return (await client.GET("/v1/me/calculations", { cache: "no-store" })).data?.items ?? [];
}

export async function saveCalculation(name: string, input: CalculatorInput) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  const res = await client.POST("/v1/me/calculations", { body: { name, input }, cache: "no-store" });
  return { status: res.response.status, saved: res.data, code: (res.error as Problem | undefined)?.code };
}

export async function deleteCalculation(id: string) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  return { status: (await client.DELETE("/v1/me/calculations/{id}", { params: { path: { id } }, cache: "no-store" })).response.status };
}

export async function getMyAlerts(locale: Locale): Promise<{ items: PriceAlert[]; max: number }> {
  const client = await signedIn();
  if (!client) return { items: [], max: 0 };
  return (await client.GET("/v1/me/alerts", { params: { header: { "Accept-Language": locale } }, cache: "no-store" })).data ?? { items: [], max: 0 };
}

export async function createAlert(input: PriceAlertInput) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  const res = await client.POST("/v1/me/alerts", { body: input, cache: "no-store" });
  return { status: res.response.status, code: (res.error as Problem | undefined)?.code };
}

export async function setAlertActive(id: string, active: boolean) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  return { status: (await client.PUT("/v1/me/alerts/{id}", { params: { path: { id } }, body: { active }, cache: "no-store" })).response.status };
}

export async function deleteAlert(id: string) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  return { status: (await client.DELETE("/v1/me/alerts/{id}", { params: { path: { id } }, cache: "no-store" })).response.status };
}
