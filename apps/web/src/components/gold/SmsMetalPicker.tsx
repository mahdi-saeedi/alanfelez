"use client";

import { useState } from "react";
import { formatNumber, type Locale } from "@alanfelez/ui/format";

/**
 * The SMS metals as tick boxes with a live total (client, 2026-11-04): on the Gold checkout page (name smsMetals,
 * the plan's price plus each metal) and on «حساب من» to add metals (name metals). Paid metals show ticked and locked.
 */
export function SmsMetalPicker({ metals, paid = [], unitRial, baseRial = "0", locale, labels, name = "metals", withButton = true }: {
  metals: { slug: string; name: string }[];
  paid?: string[];
  unitRial: string;
  baseRial?: string;
  locale: Locale;
  labels: { paid: string; total: string; pay: string; none: string; toman: string };
  name?: string;
  withButton?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const total = BigInt(baseRial) + BigInt(unitRial) * BigInt(picked.length);
  const toman = (rial: bigint) => `${formatNumber(rial / 10n, locale)} ${labels.toman}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {metals.map((m) => {
          const isPaid = paid.includes(m.slug);
          return (
            <label key={m.slug} className={isPaid ? "cursor-not-allowed" : "cursor-pointer"} title={isPaid ? labels.paid : undefined}>
              <input
                type="checkbox"
                name={isPaid ? undefined : name}
                value={m.slug}
                checked={isPaid || picked.includes(m.slug)}
                disabled={isPaid}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.slug] : p.filter((x) => x !== m.slug)))}
                className="peer sr-only"
              />
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-gold ${
                  isPaid ? "border-gold bg-gold/15 font-bold text-gold-dark" : "border-border peer-checked:border-graphite peer-checked:bg-graphite peer-checked:font-bold peer-checked:text-white"
                }`}
              >
                {isPaid && <span aria-hidden>✓</span>}
                {m.name}
                {isPaid && <span className="text-[10px] font-normal opacity-80">({labels.paid})</span>}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-sm" aria-live="polite">
        {labels.total}: <strong className="tabular-nums">{toman(total)}</strong>
      </p>
      {withButton && (
        <button
          disabled={picked.length === 0 && baseRial === "0"}
          className="rounded-lg bg-gold px-5 py-2 text-sm font-bold text-graphite hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {labels.pay}
        </button>
      )}
    </div>
  );
}
