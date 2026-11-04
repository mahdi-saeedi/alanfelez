"use client";

import { useState, type ReactNode } from "react";

type Period = "month" | "quarter" | "year";

/**
 * The plans page's 1/3/12-month tabs for the home page (client, 2026-11-04): the three card sets are rendered on the
 * server and this only shows one, so switching needs no reload and doesn't jump the page to the top.
 */
export function PeriodSwitch({ tabs, panes }: { tabs: { period: Period; label: string; save?: string }[]; panes: Record<Period, ReactNode> }) {
  const [period, setPeriod] = useState<Period>("month");
  return (
    <>
      <div role="tablist" aria-label="period" className="mx-auto mt-8 flex w-fit gap-1 rounded-control border border-border bg-surface p-1">
        {tabs.map((x) => (
          <button
            key={x.period}
            type="button"
            role="tab"
            aria-selected={x.period === period}
            onClick={() => setPeriod(x.period)}
            className={`relative rounded-lg px-4 py-1.5 text-sm ${x.period === period ? "bg-graphite font-bold text-white" : "text-text-2 hover:bg-surface-2"}`}
          >
            {x.label}
            {x.save && <span className="ms-2 rounded-full bg-gold-light/40 px-1.5 text-[10px] font-bold text-gold-dark">{x.save}</span>}
          </button>
        ))}
      </div>
      {tabs.map((x) => (
        <div key={x.period} role="tabpanel" hidden={x.period !== period}>
          {panes[x.period]}
        </div>
      ))}
    </>
  );
}
