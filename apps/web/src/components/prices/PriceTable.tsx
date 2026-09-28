"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatChangeValue, formatPriceValue, formatTime, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { useLive } from "./LivePrices";
import { ChangePill } from "./ChangePill";

type Row = Schemas["PriceRow"];

function PriceRowView({ row }: { row: Row }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("prices");
  const live = useLive(row.series.slug, row);
  const s = row.series;
  const flash = live?.flash === "up" ? "animate-flash-up" : live?.flash === "down" ? "animate-flash-down" : "";
  const usd = s.currency === "USD";
  return (
    <tr className="border-t border-border hover:bg-surface-2">
      <td className="px-4 py-3 font-bold">{s.metal.name}</td>
      <td className="px-4 py-3">
        <Link href={{ pathname: "/chart", query: { series: s.slug } }} className="hover:text-gold-dark">{s.product.name}</Link>
      </td>
      <td key={live?.tick} className={`px-4 py-3 text-base font-extrabold tabular-nums ${flash}`}>
        {live ? `${usd ? "$" : ""}${formatPriceValue(live.price, locale)}` : t("noData")}
      </td>
      <td className="px-4 py-3 text-text-2">{t(`units.${s.unit}`)}</td>
      <td className={`px-4 py-3 tabular-nums ${Number(live?.change?.bp ?? 0) >= 0 ? "text-up" : "text-down"}`} dir="ltr">
        {live?.change ? formatChangeValue(live.change.amount, s, locale) : "—"}
      </td>
      <td className="px-4 py-3"><ChangePill bp={live?.change?.bp} locale={locale} size="sm" /></td>
      <td className="px-4 py-3 text-text-3 tabular-nums">{live ? formatTime(live.observedAt, locale) : "—"}</td>
      <td className="px-4 py-3 text-text-3">{row.source ?? s.market.name}</td>
    </tr>
  );
}

/** Metal prices table (design 07-metal-prices). Values update live; rows come from the server (tier-filtered). */
export function PriceTable({ rows }: { rows: Row[] }) {
  const t = useTranslations("prices");
  const locale = useLocale() as Locale;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-start text-sm">
        <thead className="bg-surface-2 text-xs text-text-2">
          <tr>
            <th className="px-4 py-3 text-start font-bold">{t("col.metal")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.type")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.price", { unit: locale === "fa" ? "تومان/kg" : "Toman/kg" })}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.unit")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.change")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.changePct")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.updated")}</th>
            <th className="px-4 py-3 text-start font-bold">{t("col.source")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <PriceRowView key={r.series.slug} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
