import type { Schemas } from "@alanfelez/api-client";

/** Whose turn it is: open = waiting for support (gold), answered = waiting for the user (green), closed. */
export function TicketStatus({ status, label }: { status: Schemas["TicketStatus"]; label: string }) {
  const tone = status === "answered" ? "bg-up-bg text-up" : status === "open" ? "bg-gold/15 text-gold-dark" : "bg-surface-2 text-text-2";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{label}</span>;
}
