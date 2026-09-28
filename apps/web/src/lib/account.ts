import "server-only";
import type { Schemas } from "@alanfelez/api-client";
import { callerApi } from "./api";

export type Me = Schemas["Me"];
export type Order = Schemas["Order"];
export type Quote = Schemas["CheckoutQuote"];
export type Period = Schemas["BillingPeriod"];
export type PaidPlan = Schemas["PaidPlan"];

/**
 * Calls for the signed-in user. Each returns null when there's no session (the page then offers "login").
 * Never cached: every response is personal.
 */
async function signedIn() {
  const c = await callerApi();
  return c.personal ? c.client : null;
}

export async function getMe(): Promise<Me | null> {
  const client = await signedIn();
  if (!client) return null;
  const res = await client.GET("/v1/me", { cache: "no-store" });
  return res.data ?? null;
}

export async function getMyOrders(): Promise<Order[]> {
  const client = await signedIn();
  if (!client) return [];
  const res = await client.GET("/v1/me/orders", { cache: "no-store" });
  return res.data?.items ?? [];
}

export async function getMyOrder(id: string): Promise<Order | null> {
  const client = await signedIn();
  if (!client) return null;
  const res = await client.GET("/v1/me/orders/{id}", { params: { path: { id } }, cache: "no-store" });
  return res.data ?? null;
}

export async function getQuote(plan: PaidPlan, period: Period): Promise<{ quote?: Quote; status: number }> {
  const client = await signedIn();
  if (!client) return { status: 401 };
  const res = await client.POST("/v1/checkout/quote", { body: { plan, period }, cache: "no-store" });
  return { quote: res.data, status: res.response.status };
}

export async function startCheckout(plan: PaidPlan, period: Period, idempotencyKey: string, locale: "fa" | "en") {
  const client = await signedIn();
  if (!client) return { status: 401 as const };
  const res = await client.POST("/v1/checkout", {
    params: { header: { "Idempotency-Key": idempotencyKey, "Accept-Language": locale } },
    body: { plan, period },
    cache: "no-store",
  });
  const problem = res.error as Schemas["Problem"] | undefined;
  return { status: res.response.status, result: res.data, code: problem?.code };
}

export async function requestRefund(id: string, reason: string) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  const res = await client.POST("/v1/me/orders/{id}/refund", { params: { path: { id } }, body: reason ? { reason } : {}, cache: "no-store" });
  return { status: res.response.status, code: (res.error as Schemas["Problem"] | undefined)?.code };
}

export type Ticket = Schemas["Ticket"];
export type TicketThread = Schemas["TicketThread"];

export async function getMyTickets(): Promise<Ticket[]> {
  const client = await signedIn();
  if (!client) return [];
  const res = await client.GET("/v1/me/tickets", { cache: "no-store" });
  return res.data?.items ?? [];
}

/** null = not the caller's ticket (or none). */
export async function getMyTicket(id: string): Promise<TicketThread | null> {
  const client = await signedIn();
  if (!client) return null;
  const res = await client.GET("/v1/me/tickets/{id}", { params: { path: { id } }, cache: "no-store" });
  return res.data ?? null;
}

export async function createTicket(subject: string, body: string, idempotencyKey: string) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  const res = await client.POST("/v1/me/tickets", { params: { header: { "Idempotency-Key": idempotencyKey } }, body: { subject, body }, cache: "no-store" });
  return { status: res.response.status, ticket: res.data };
}

export async function replyTicket(id: string, body: string) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  const res = await client.POST("/v1/me/tickets/{id}/messages", { params: { path: { id } }, body: { body }, cache: "no-store" });
  return { status: res.response.status };
}

export async function closeTicket(id: string) {
  const client = await signedIn();
  if (!client) return { status: 401 };
  const res = await client.POST("/v1/me/tickets/{id}/close", { params: { path: { id } }, cache: "no-store" });
  return { status: res.response.status };
}
