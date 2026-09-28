import { NextResponse } from "next/server";
import { api } from "@/lib/api";

/**
 * The payment gateway sends the browser here after payment (PAYMENTS_CALLBACK_URL). We hand every query parameter to
 * the API, which verifies with the gateway server-to-server (nothing here is trusted), then show the result page.
 * No session is needed: the callback can arrive after the user's session ended.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const order = url.searchParams.get("order") ?? "";
  const lang = url.searchParams.get("lang") === "en" ? "en" : "fa";
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (k !== "order" && k !== "lang") params[k] = v;
  });

  let status = "error";
  if (/^[0-9a-f-]{36}$/i.test(order)) {
    const res = await api.POST("/v1/payments/verify", { body: { orderId: order, params }, cache: "no-store" });
    status = res.data?.status ?? (res.response.status === 503 ? "retry" : "error");
  }
  const base = process.env.AUTH_URL ?? url.origin; // the public website origin (not the container's own address)
  const result = new URL(`${lang === "en" ? "/en" : ""}/checkout/result`, base);
  result.searchParams.set("order", order);
  result.searchParams.set("status", status);
  return NextResponse.redirect(result, 303);
}
