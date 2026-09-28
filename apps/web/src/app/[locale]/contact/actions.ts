"use server";

import { headers } from "next/headers";
import type { Schemas } from "@alanfelez/api-client";
import { callerApi } from "@/lib/api";

export type ContactState = { status: "idle" | "sent" | "invalid" | "limited" | "failed" };

/**
 * Sends the contact form to the API. The visitor's X-Forwarded-For (set by the ingress) is passed on, so the API's
 * per-IP rate limit sees the visitor rather than this server (SECURITY §5). Signed-in senders are linked to their account.
 */
export async function sendContact(_: ContactState, form: FormData): Promise<ContactState> {
  const field = (k: string) => String(form.get(k) ?? "").trim();
  const body: Schemas["ContactInput"] = {
    name: field("name"),
    phone: field("phone"),
    subject: field("subject") as Schemas["ContactSubject"],
    body: field("body"),
    ...(field("email") ? { email: field("email") } : {}),
    ...(field("website") ? { website: field("website") } : {}), // honeypot
  };
  if (body.name.length < 2 || body.phone.length < 7 || body.body.length < 10 || !body.subject) return { status: "invalid" };

  const h = await headers();
  const pass: Record<string, string> = {};
  const forwarded = h.get("x-forwarded-for");
  const agent = h.get("user-agent");
  if (forwarded) pass["X-Forwarded-For"] = forwarded;
  if (agent) pass["User-Agent"] = agent.slice(0, 300); // for abuse review in the admin
  const { client } = await callerApi();
  const res = await client.POST("/v1/contact", { body, headers: pass, cache: "no-store" });
  if (res.response.status === 202) return { status: "sent" };
  if (res.response.status === 429) return { status: "limited" };
  if (res.response.status === 400) return { status: "invalid" };
  return { status: "failed" };
}
