"use client";


import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import type { Locale } from "@alanfelez/ui/format";
import { ChangePill } from "./ChangePill";
import { useLive } from "./LivePrices";

type Row = Schemas["PriceRow"];

function MoverItem({ row }: { row: Row }) {
  const locale = useLocale() as Locale;
  const live = useLive(row.series.slug);
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="truncate">{row.series.product.name}</span>
      <ChangePill bp={live?.change?.bp} locale={locale} size="sm" />
    </li>
  );
}

/**
 * «بیشترین رشد» / «بیشترین کاهش» sidebar blocks. Ranked by the server-rendered change; the values inside update
 * live (re-ranking on every tick would make the list jump around).
 */
export function Movers({ rows, count = 3 }: { rows: Row[]; count?: number }) {
  const t = useTranslations("prices");
  const withChange = rows.filter((r) => r.change);
  const byBp = [...withChange].sort((a, b) => (b.change?.bp ?? 0) - (a.change?.bp ?? 0));
  const gainers = byBp.filter((r) => (r.change?.bp ?? 0) > 0).slice(0, count);
  const losers = byBp.filter((r) => (r.change?.bp ?? 0) < 0).reverse().slice(0, count);
  return (
    <>
      <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
        <h2 className="mb-2 text-sm font-bold text-up">{t("gainers")}</h2>
        <ul>{gainers.map((r) => <MoverItem key={r.series.slug} row={r} />)}</ul>
      </section>
      <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
        <h2 className="mb-2 text-sm font-bold text-down">{t("losers")}</h2>
        <ul>{losers.map((r) => <MoverItem key={r.series.slug} row={r} />)}</ul>
      </section>
    </>
  );
}

