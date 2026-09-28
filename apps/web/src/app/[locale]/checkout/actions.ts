"use server";

import { redirect } from "next/navigation";
import { startCheckout, type PaidPlan, type Period } from "@/lib/account";

/** Creates the order and sends the browser to the gateway (or straight to the result when nothing is due). */
export async function payAction(form: FormData) {
  const plan = form.get("plan") as PaidPlan;
  const period = form.get("period") as Period;
  const key = String(form.get("key") ?? "");
  const locale = form.get("locale") === "en" ? "en" : "fa";
  const prefix = locale === "en" ? "/en" : "";
  if (form.get("agree") !== "on") redirect(`${prefix}/checkout?plan=${plan}&period=${period}&error=agree`);

  const res = await startCheckout(plan, period, key, locale);
  if (res.status === 401) redirect(`${prefix}/checkout?plan=${plan}&period=${period}`);
  if (!res.result) redirect(`${prefix}/checkout?plan=${plan}&period=${period}&error=${res.code ?? "generic"}`);
  if (res.result.redirectUrl) redirect(res.result.redirectUrl);
  redirect(`${prefix}/checkout/result?order=${res.result.order.id}&status=${res.result.order.status}`);
}
