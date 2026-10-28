"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatChangeValue, formatPriceValue, formatTime, type Locale, type PriceDisplay } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { LockIcon } from "@/components/LockIcon";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";
import { MetalIcon } from "./MetalIcon";

type Row = Schemas["PriceRow"];
type Series = Schemas["SeriesRef"];

/** The unit a row's price is shown in, in words: «تومان/کیلوگرم», «ریال/تن», «دلار/تن» (USD/ton stays as it is). */
function useUnitLabel() {
  const t = useTranslations("prices");
  return (s: Pick<Series, "currency">, d: PriceDisplay) =>
    s.currency === "USD" ? t("unitLabel.usd") : `${t(d.rial ? "unitLabel.rial" : "unitLabel.toman")}/${t(d.perTon ? "units.ton" : "units.kg")}`;
}

function PriceRowView({ row, display }: { row: Row; display: PriceDisplay }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const unit = useUnitLabel();
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  const usd = s.currency === "USD";
  return (
    <tr className="border-t border-border hover:bg-surface-2">
      <td className="px-4 py-3 font-bold">
        <span className="flex items-center gap-2">
          <MetalIcon slug={s.metal.slug} className="h-8 w-8" />
          {s.metal.name}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link href={{ pathname: "/chart", query: { series: s.slug } }} className="hover:text-gold-dark">{s.product.name}</Link>
      </td>
      <td key={live?.tick} className={`px-4 py-3 text-base font-extrabold tabular-nums ${flash}`}>
        {live ? `${usd ? "$" : ""}${formatPriceValue(live.price, locale, display)}` : t("noData")}
      </td>
      <td className="px-4 py-3 text-text-2">{unit(s, display)}</td>
      <td className={`px-4 py-3 tabular-nums ${Number(live?.change?.bp ?? 0) >= 0 ? "text-up" : "text-down"}`} dir="ltr">
        {live?.change ? formatChangeValue(live.change.amount, s, locale, display) : "—"}
      </td>
      <td className="px-4 py-3"><ChangePill bp={live?.change?.bp} locale={locale} size="sm" /></td>
      <td className="px-4 py-3 text-text-3 tabular-nums">{live ? formatTime(live.observedAt, locale) : "—"}</td>
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

/** Phone layout of one row: product and price on top, change and source/time below (no sideways scrolling). */
function PriceCardView({ row, display }: { row: Row; display: PriceDisplay }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const unit = useUnitLabel();
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <Link href={{ pathname: "/chart", query: { series: s.slug } }} className="flex min-w-0 items-center gap-3">
          <MetalIcon slug={s.metal.slug} className="h-10 w-10" />
          <span className="min-w-0">
            <span className="block truncate font-bold">{s.product.name}</span>
            <span className="text-xs text-text-3">{s.metal.name} · {unit(s, display)}</span>
          </span>
        </Link>
        <span key={live?.tick} className={`shrink-0 rounded-md text-end text-base font-extrabold tabular-nums ${flash}`}>
          {live ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue(live.price, locale, display)}` : t("noData")}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-text-3">
        <span className="truncate">{row.source ?? s.market.name} · {live ? formatTime(live.observedAt, locale) : "—"}</span>
        <ChangePill bp={live?.change?.bp} locale={locale} size="sm" />
      </div>
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

/**
 * Metal prices table (design 07-metal-prices). Values update live; rows come from the server (tier-filtered).
 * `locked` are the series the caller's plan doesn't include (names only, client 2026-10-28), after the priced rows.
 * `display` switches domestic prices between Toman and Rial and per kg or per ton (SCOPE §14).
 */
export function PriceTable({ rows, locked = [], plan = "", display = {} }: { rows: Row[]; locked?: Series[]; plan?: string; display?: PriceDisplay }) {
  const t = useTranslations("prices");
  return (
    <>
    <ul className="divide-y divide-border md:hidden">
      {rows.map((r) => (
        <PriceCardView key={r.series.slug} row={r} display={display} />
      ))}
      {locked.map((s) => (
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
            <th className="px-4 py-3 text-start font-bold">{t("col.changePct")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.updated")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.source")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <PriceRowView key={r.series.slug} row={r} display={display} />
          ))}
          {locked.map((s) => (
            <LockedRowView key={s.slug} s={s} plan={plan} display={display} />
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
