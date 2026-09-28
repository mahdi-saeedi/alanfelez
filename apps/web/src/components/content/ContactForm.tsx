"use client";

import { useActionState } from "react";
import type { ContactState } from "@/app/[locale]/contact/actions";

type Labels = Record<"name" | "phone" | "email" | "subject" | "message" | "messagePlaceholder" | "choose" | "send" | "sending" | "sent" | "invalid" | "limited" | "failed", string>;

/** Contact form (design 15). Works without JavaScript too: it's a plain form posting to a server action. */
export function ContactForm({
  action,
  labels,
  subjects,
}: {
  action: (s: ContactState, f: FormData) => Promise<ContactState>;
  labels: Labels;
  subjects: { value: string; label: string }[];
}) {
  const [state, submit, pending] = useActionState<ContactState, FormData>(action, { status: "idle" });
  if (state.status === "sent") {
    return <p role="status" className="rounded-card border border-up/40 bg-up-bg p-5 text-sm text-up">{labels.sent}</p>;
  }
  const input = "w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-gold";
  return (
    <form action={submit} className="space-y-4">
      {state.status !== "idle" && (
        <p role="alert" className="rounded-control bg-down-bg px-3 py-2 text-sm text-down">{labels[state.status as Exclude<ContactState["status"], "idle" | "sent">]}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">
          <span className="font-bold">{labels.name}</span>
          <input name="name" required minLength={2} maxLength={100} autoComplete="name" className={input} />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-bold">{labels.phone}</span>
          <input name="phone" required minLength={7} maxLength={20} inputMode="tel" autoComplete="tel" dir="ltr" placeholder="09xx xxx xxxx" className={input} />
        </label>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="font-bold">{labels.email}</span>
        <input name="email" type="email" maxLength={200} autoComplete="email" dir="ltr" placeholder="email@example.com" className={input} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-bold">{labels.subject}</span>
        <select name="subject" required defaultValue="" className={input}>
          <option value="" disabled>{labels.choose}</option>
          {subjects.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-bold">{labels.message}</span>
        <textarea name="body" required minLength={10} maxLength={5000} rows={6} placeholder={labels.messagePlaceholder} className={input} />
      </label>
      {/* Honeypot: hidden from people, bots fill it and are dropped by the API. */}
      <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button disabled={pending} className="w-full rounded-control bg-graphite py-3 text-sm font-bold text-white hover:bg-graphite-2 disabled:opacity-60">
        {pending ? labels.sending : labels.send}
      </button>
    </form>
  );
}
