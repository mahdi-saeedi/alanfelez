"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatChangeValue, formatDate, formatPriceValue, formatTime, tehranDaysAgo, type Locale, type PriceDisplay } from "@alanfelez/ui/format";
import { Link, useRouter } from "@/i18n/navigation";
import { LockIcon } from "@/components/LockIcon";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";
import { MetalIcon } from "./MetalIcon";

type Row = Schemas["PriceRow"];
type Series = Schemas["SeriesRef"];
type Sort = "" | "up" | "down";

/** The unit a row's price is shown in, in words: «تومان/کیلوگرم», «ریال/تن», «دلار/تن» (USD/ton stays as it is). */
function useUnitLabel() {
  const t = useTranslations("prices");
  return (s: Pick<Series, "currency">, d: PriceDisplay) =>
    s.currency === "USD" ? t("unitLabel.usd") : `${t(d.rial ? "unitLabel.rial" : "unitLabel.toman")}/${t(d.perTon ? "units.ton" : "units.kg")}`;
}

/** "Last updated": the time for today's prices, «دیروز ۱۲:۱۷» for yesterday's, the date for older ones (client, 2026-10-28). */
function useUpdated() {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  return (iso?: string) => {
    if (!iso) return "—";
    const days = tehranDaysAgo(iso);
    if (days <= 0) return formatTime(iso, locale);
    if (days === 1) return t("yesterday", { time: formatTime(iso, locale) });
    return formatDate(iso, locale);
  };
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-text-3 group-hover:text-gold-dark" aria-hidden>
      <path d="M4 19h16M6 15l4-4 3 3 5-6" className="fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PriceRowView({ row, display }: { row: Row; display: PriceDisplay }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const unit = useUnitLabel();
  const updated = useUpdated();
  const router = useRouter();
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const chart = { pathname: "/chart", query: { series: s.slug } };
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  const usd = s.currency === "USD";
  // The whole row opens the chart; the product name stays a real link for keyboards and screen readers.
  return (
    <tr className="group cursor-pointer border-t border-border hover:bg-surface-2" onClick={() => router.push(chart)}>
      <td className="px-4 py-3 font-bold">
        <span className="flex items-center gap-2">
          <MetalIcon slug={s.metal.slug} className="h-8 w-8" />
          {s.metal.name}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link href={chart} title={t("openChart")} className="inline-flex items-center gap-1.5 group-hover:text-gold-dark" onClick={(e) => e.stopPropagation()}>
          {s.product.name}
          <ChartIcon />
        </Link>
      </td>
      <td key={live?.tick} className={`px-4 py-3 text-base font-extrabold tabular-nums ${flash}`}>
        {live ? `${usd ? "$" : ""}${formatPriceValue(live.price, locale, display)}` : t("noData")}
      </td>
      <td className="px-4 py-3 text-text-2">{unit(s, display)}</td>
      <td className={`px-4 py-3 tabular-nums ${Number(live?.change?.bp ?? 0) >= 0 ? "text-up" : "text-down"}`} dir="ltr">
        {live?.change ? formatChangeValue(live.change.amount, s, locale, display) : "—"}
      </td>
      <td className="px-4 py-3"><ChangePill bp={live?.change?.bp} locale={locale} size="sm" /></td>
      <td className="px-4 py-3 whitespace-nowrap text-text-3 tabular-nums">{updated(live?.observedAt)}</td>
      <td className="px-4 py-3 text-text-3">{row.source ?? s.market.name}</td>
    </tr>
  );
}

/** A series the caller's plan doesn't include: its name and market, the price replaced by 🔒 + the plan (no price exists here). */
function LockedRowView({ s, plan, display }: { s: Series; plan: string; display: PriceDisplay }) {
  const unit = useUnitLabel();
  return (
    <tr className="border-t border-border bg-gold/[0.03] text-text-2">
      <td className="px-4 py-3 font-bold">
        <span className="flex items-center gap-2 opacity-70">
          <MetalIcon slug={s.metal.slug} className="h-8 w-8" />
          {s.metal.name}
        </span>
      </td>
      <td className="px-4 py-3">{s.product.name}</td>
      <td className="px-4 py-3">
        <Link href="/plans" className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-bold text-gold-dark hover:bg-gold/10">
          <LockIcon className="h-4 w-4" />
          {plan}
        </Link>
      </td>
      <td className="px-4 py-3">{unit(s, display)}</td>
      <td className="px-4 py-3 text-text-3">—</td>
      <td className="px-4 py-3 text-text-3">—</td>
      <td className="px-4 py-3 text-text-3">—</td>
      <td className="px-4 py-3 text-text-3">{s.market.name}</td>
    </tr>
  );
}

/** Phone layout of one row: the whole card opens the chart; product and price on top, change and source/time below. */
function PriceCardView({ row, display }: { row: Row; display: PriceDisplay }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const unit = useUnitLabel();
  const updated = useUpdated();
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  return (
    <li>
      <Link href={{ pathname: "/chart", query: { series: s.slug } }} className="group block px-4 py-3 active:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <MetalIcon slug={s.metal.slug} className="h-10 w-10" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-bold"><span className="truncate">{s.product.name}</span><ChartIcon /></span>
              <span className="text-xs text-text-3">{s.metal.name} · {unit(s, display)}</span>
            </span>
          </span>
          <span key={live?.tick} className={`shrink-0 rounded-md text-end text-base font-extrabold tabular-nums ${flash}`}>
            {live ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue(live.price, locale, display)}` : t("noData")}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-text-3">
          <span className="truncate">{row.source ?? s.market.name} · {updated(live?.observedAt)}</span>
          <ChangePill bp={live?.change?.bp} locale={locale} size="sm" />
        </div>
      </Link>
    </li>
  );
}

function LockedCardView({ s, plan }: { s: Series; plan: string }) {
  return (
    <li className="bg-gold/[0.03] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <MetalIcon slug={s.metal.slug} className="h-10 w-10 opacity-70" />
          <span className="min-w-0">
            <span className="block truncate font-bold text-text-2">{s.product.name}</span>
            <span className="text-xs text-text-3">{s.metal.name} · {s.market.name}</span>
          </span>
        </span>
        <Link href="/plans" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gold/50 px-2.5 py-0.5 text-xs font-bold text-gold-dark">
          <LockIcon className="h-4 w-4" />
          {plan}
        </Link>
      </div>
    </li>
  );
}

/** Persian and Arabic letters compare the same (ی/ي, ک/ك), and case doesn't matter, so «كابل» finds «کابل». */
function norm(s: string) {
  return s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").trim();
}

/**
 * Metal prices table (design 07-metal-prices). Values update live; rows come from the server (tier-filtered).
 * `locked` are the series the caller's plan doesn't include (names only, client 2026-10-28), after the priced rows.
 * `display` switches domestic prices between Toman and Rial and per kg or per ton (SCOPE §14).
 * A search box and a sort by daily change (client, 2026-10-28) work in the browser on the rows already here.
 */
export function PriceTable({ rows, locked = [], plan = "", display = {} }: { rows: Row[]; locked?: Series[]; plan?: string; display?: PriceDisplay }) {
  const t = useTranslations("prices");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("");
  const match = (s: Series) => !q || norm(`${s.product.name} ${s.metal.name} ${s.market.name}`).includes(norm(q));
  const bp = (r: Row) => r.change?.bp ?? 0;
  const shown = rows.filter((r) => match(r.series));
  if (sort) shown.sort((a, b) => (sort === "up" ? bp(b) - bp(a) : bp(a) - bp(b)));
  const shownLocked = locked.filter(match);
  const nextSort: Record<Sort, Sort> = { "": "up", up: "down", down: "" };
  const arrow = sort === "up" ? "↓" : sort === "down" ? "↑" : "↕";

  return (
    <>
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{t("search")}</span>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" aria-hidden>
          <circle cx="11" cy="11" r="6" className="fill-none stroke-current" strokeWidth="2" />
          <path d="m20 20-4.5-4.5" className="fill-none stroke-current" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-surface-2 py-2 ps-9 pe-3 text-sm outline-none focus:border-gold"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-text-2">
        <span className="sr-only sm:not-sr-only">{t("sortBy")}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none focus:border-gold">
          <option value="">{t("sort.default")}</option>
          <option value="up">{t("sort.up")}</option>
          <option value="down">{t("sort.down")}</option>
        </select>
      </label>
    </div>
    {shown.length === 0 && shownLocked.length === 0 && <p className="p-8 text-center text-sm text-text-2">{t("noMatch")}</p>}
    <ul className="divide-y divide-border md:hidden">
      {shown.map((r) => (
        <PriceCardView key={r.series.slug} row={r} display={display} />
      ))}
      {shownLocked.map((s) => (
        <LockedCardView key={s.slug} s={s} plan={plan} />
      ))}
    </ul>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-start text-sm">
        <thead className="bg-surface-2 text-xs text-text-2">
          <tr>
            <th className="px-4 py-3 text-start font-bold">{t("col.metal")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.type")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.priceOnly")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.unit")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.change")}</th>
            <th className="px-4 py-3 text-start font-bold" aria-sort={sort === "up" ? "descending" : sort === "down" ? "ascending" : "none"}>
              <button type="button" onClick={() => setSort(nextSort[sort])} className="inline-flex items-center gap-1 font-bold hover:text-gold-dark" title={t("sortBy")}>
                {t("col.changePct")} <span aria-hidden>{arrow}</span>
              </button>
            </th>
            <th className="px-4 py-3 text-start font-bold">{t("col.updated")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.source")}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <PriceRowView key={r.series.slug} row={r} display={display} />
          ))}
          {shownLocked.map((s) => (
            <LockedRowView key={s.slug} s={s} plan={plan} display={display} />
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
