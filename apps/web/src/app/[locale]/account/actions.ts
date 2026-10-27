"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeTicket, createTicket, replyTicket, requestRefund } from "@/lib/account";
import { saveSmsSettings } from "@/lib/gold";

export async function refundAction(form: FormData) {
  const id = String(form.get("order") ?? "");
  const reason = String(form.get("reason") ?? "").slice(0, 1000);
  await requestRefund(id, reason);
  revalidatePath("/[locale]/account", "page");
}

const prefix = (form: FormData) => (form.get("locale") === "en" ? "/en" : "");

/** Opens a ticket and shows it. The hidden key makes a double submit return the same ticket. */
export async function createTicketAction(form: FormData) {
  const subject = String(form.get("subject") ?? "").trim().slice(0, 150);
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  const key = String(form.get("key") ?? "");
  const res = await createTicket(subject, body, key);
  if (res.ticket) redirect(`${prefix(form)}/account/tickets/${res.ticket.id}`);
  redirect(`${prefix(form)}/account?ticket=invalid#tickets`);
}

export async function replyTicketAction(form: FormData) {
  const id = String(form.get("id") ?? "");
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  if (body) await replyTicket(id, body);
  revalidatePath("/[locale]/account/tickets/[id]", "page");
}

export async function closeTicketAction(form: FormData) {
  await closeTicket(String(form.get("id") ?? ""));
  revalidatePath("/[locale]/account/tickets/[id]", "page");
}

/**
 * The Gold price SMS settings (client, 2026-10-27): the main metal and on/off. Used on the account page and on the
 * payment result page; `back` is where to return (a path on this site).
 */
export async function saveSmsSettingsAction(form: FormData) {
  const metal = String(form.get("metal") ?? "");
  const enabled = form.get("enabled") === "on";
  const back = String(form.get("back") ?? "/account");
  const res = metal ? await saveSmsSettings(metal, enabled) : { status: 400 };
  revalidatePath("/[locale]/account", "page");
  const sep = back.includes("?") ? "&" : "?";
  const path = back.startsWith("/") && !back.startsWith("//") ? back : "/account";
  redirect(`${prefix(form)}${path}${sep}sms=${res.status === 200 ? "saved" : "failed"}#sms`);
}
