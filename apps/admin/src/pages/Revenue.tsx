import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import { formatDate, formatNumber, formatToman, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { Badge, Card, Notice, Page, Td, Th } from "./ui";
import { RangePicker, type Range, lastDays } from "./dates";
import { DayBars } from "./charts";

/**
 * «گزارش فروش» (client, 2026-11-05): revenue per day by Silver, Gold and SMS metals, refunds, paying members and the
 * monthly recurring revenue now, renewals, and the paid plans ending in the next 7 days (for sales calls).
 */
export function RevenuePage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [range, setRange] = useState<Range>(lastDays(30));
  const q = useQuery({
    queryKey: ["admin", "revenue", range],
    queryFn: async () => unwrap(await api.GET("/v1/admin/revenue", { params: { query: { from: range.from, to: range.to } } })),
  });
  const r = q.data;
  const toman = (m: { amount: string }) => formatToman(m.amount, locale);
  const t2n = (m: { amount: string }) => Number(BigInt(m.amount) / 10n);
  const n = (v: number) => formatNumber(v, locale);
  const rate = r && r.renewalsEnded ? Math.round((r.renewalsRenewed / r.renewalsEnded) * 100) : null;
  return (
    <Page title={t("rev.title")} hint={t("rev.hint")}>
      <RangePicker value={range} onChange={setRange} locale={locale} />
      {q.isError && <Notice tone="error">{errorText(q.error, t)}</Notice>}
      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t("rev.total")} value={toman(r.total)} sub={t("rev.orders", { n: n(r.orders) })} />
            <Kpi label={t("rev.mrr")} value={toman(r.mrr)} sub={t("rev.mrrHint")} />
            <Kpi label={t("rev.paying")} value={`${n(r.payingSilver)} / ${n(r.payingGold)}`} sub={t("rev.payingHint")} />
            <Kpi label={t("rev.renewals")} value={rate === null ? "—" : `${n(rate)}٪`} sub={t("rev.renewalsHint", { renewed: n(r.renewalsRenewed), ended: n(r.renewalsEnded) })} />
          </div>
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">{t("rev.byDay")}</h2>
              <span className="text-xs text-text-2">
                {t("rev.silver")}: {toman(r.silver)} · {t("rev.gold")}: {toman(r.gold)} · {t("rev.sms")}: {toman(r.sms)}
                {BigInt(r.refunds.amount) > 0n && <> · <span className="text-down">{t("rev.refunds")}: {toman(r.refunds)}</span></>}
              </span>
            </div>
            <DayBars
              days={r.days.map((d) => d.day)}
              series={[
                { label: t("rev.silver"), color: "#8fa3b8", values: r.days.map((d) => t2n(d.silver)) },
                { label: t("rev.gold"), color: "#c9a227", values: r.days.map((d) => t2n(d.gold)) },
                { label: t("rev.sms"), color: "#16a34a", values: r.days.map((d) => t2n(d.sms)) },
              ]}
              locale={locale}
              format={(v) => formatToman(String(v * 10), locale)}
            />
          </Card>
          <Card>
            <h2 className="p-3 font-bold">{t("rev.expiring")}</h2>
            <p className="px-3 pb-2 text-xs text-text-3">{t("rev.expiringHint")}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-surface-2"><tr><Th>{t("rev.member")}</Th><Th>{t("rev.mobile")}</Th><Th>{t("rev.plan")}</Th><Th>{t("rev.ends")}</Th></tr></thead>
                <tbody>
                  {r.expiring.length === 0 && <tr><Td className="text-text-2">{t("rev.noExpiring")}</Td></tr>}
                  {r.expiring.map((e) => (
                    <tr key={e.userId} className="border-t border-border">
                      <Td><Link to={`/activity/${e.userId}`} className="font-bold hover:text-gold-dark">{e.name || "—"}</Link>{e.company && <div className="text-xs text-text-3">{e.company}</div>}</Td>
                      <Td dir="ltr" className="text-start tabular-nums"><a href={`tel:${e.mobile}`} className="hover:underline">{e.mobile}</a></Td>
                      <Td><Badge tone={e.plan === "gold" ? "gold" : "gray"}>{t(`plan.${e.plan}`)}</Badge></Td>
                      <Td className="text-xs">{formatDate(e.endsAt, locale)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </Page>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="space-y-1 p-4">
      <div className="text-xs text-text-2">{label}</div>
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-text-3">{sub}</div>}
    </Card>
  );
}
