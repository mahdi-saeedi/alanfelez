"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDecimal } from "@alanfelez/ui/format";
import { closeTicket, createTicket, replyTicket, requestRefund } from "@/lib/account";
import { createAlert, deleteAlert, setAlertActive, type PriceAlertInput } from "@/lib/gold";

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
 * Adds an SMS price alert. The form sends the value as shown (Toman/kg, $/ton or %); the API wants minor units:
 * IRR Rial (×10), USD cents (×100), a move in basis points (×100).
 */
export async function createAlertAction(form: FormData) {
  const [series, currency] = String(form.get("series") ?? "").split(":");
  const kind = String(form.get("kind") ?? "") as PriceAlertInput["kind"];
  const value = parseDecimal(String(form.get("value") ?? ""));
  let res: { status: number; code?: string } = { status: 400 };
  if (series && value !== undefined && value > 0) {
    res =
      kind === "move"
        ? await createAlert({ series, kind, moveBp: Math.round(value * 100) })
        : await createAlert({ series, kind, threshold: String(Math.round(value * (currency === "USD" ? 100 : 10))) });
  }
  const err = res.status === 201 ? "" : res.code === "FEATURE_LOCKED" ? "locked" : res.status === 409 ? "full" : "invalid";
  revalidatePath("/[locale]/account", "page");
  redirect(`${prefix(form)}/account${err ? `?alert=${err}` : ""}#alerts`);
}

export async function toggleAlertAction(form: FormData) {
  await setAlertActive(String(form.get("id") ?? ""), form.get("active") === "true");
  revalidatePath("/[locale]/account", "page");
}

export async function deleteAlertAction(form: FormData) {
  await deleteAlert(String(form.get("id") ?? ""));
  revalidatePath("/[locale]/account", "page");
}
