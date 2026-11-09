import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import { formatDate, formatNumber, formatTime, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { Badge, Button, Card, Notice, Page, Td, Th } from "./ui";
import { RangePicker, type Range, lastDays, todayTehran } from "./dates";

/**
 * Visitor stats (client, 2026-10-27): each day of a range (default the last 30 days; any from–to range, client
 * 2026-11-08), and who of the signed-in users came on a chosen day or in the whole range. Anonymous visitors are counted
 * without cookies and can't be named.
 */
export function VisitsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [range, setRange] = useState<Range>(lastDays(30));
  const [day, setDay] = useState<string>(); // a day clicked in the list; none = the whole range
  const custom = range.from !== lastDays(30).from || range.to !== lastDays(30).to;
  const stats = useQuery({
    queryKey: ["admin", "visits", range.from, range.to, day ?? (custom ? "range" : "today")],
    queryFn: async () => unwrap(await api.GET("/v1/admin/visits", {
      // the default view keeps today's people; a chosen range lists everyone of the range
      params: { query: { from: range.from, to: range.to, ...(day ? { day } : custom ? {} : { day: todayTehran() }) } },
    })),
    refetchInterval: 60_000,
  });
  const data = stats.data;
  const sum = (k: "visitors" | "signedIn" | "pageviews") => data?.days.reduce((a, d) => a + d[k], 0) ?? 0;
  const one = data?.day ? data.days.find((d) => d.day === data.day) : undefined;
  const cards = data?.day
    ? { visitors: one?.visitors ?? 0, signedIn: one?.signedIn ?? 0, pageviews: one?.pageviews ?? 0 }
    : { visitors: sum("visitors"), signedIn: sum("signedIn"), pageviews: sum("pageviews") };
  const max = Math.max(1, ...(data?.days.map((d) => d.visitors) ?? []));
  const dayLabel = (d: string) => formatDate(`${d}T12:00:00Z`, locale);
  const n = (v: number) => formatNumber(v, locale);
  const rangeLabel = data ? t("visits.rangeLabel", { from: dayLabel(data.from), to: dayLabel(data.to) }) : "";

  return (
    <Page title={t("visits.title")} hint={t("visits.hint")}>
      <RangePicker value={range} onChange={(r) => { setRange(r); setDay(undefined); }} locale={locale} />
      {stats.isError && <Notice tone="error">{errorText(stats.error, t)}</Notice>}
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold">{data.day ? dayLabel(data.day) : rangeLabel}</p>
            {data.day && custom && <Button type="button" tone="ghost" onClick={() => setDay(undefined)}>{t("visits.wholeRange")}</Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([["visitors", cards.visitors], ["signedIn", cards.signedIn], ["pageviews", cards.pageviews]] as const).map(([k, v]) => (
              <Card key={k} className="p-4">
                <div className="text-xs text-text-2">{t(`visits.${k}`)}{!data.day && <span className="text-text-3"> {t("visits.sumNote")}</span>}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums">{n(v)}</div>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <h2 className="mb-1 text-sm font-bold">{t("visits.daysTitle", { range: rangeLabel })}</h2>
            <p className="mb-3 text-xs text-text-3">{t("visits.daysHint")}</p>
            {data.days.every((d) => d.visitors === 0) ? (
              <p className="text-sm text-text-3">{t("visits.none")}</p>
            ) : (
              <ul className="space-y-1.5">
                {data.days.map((d) => (
                  <li key={d.day}>
                    <button type="button" onClick={() => setDay(d.day)}
                      className={`grid w-full grid-cols-[7rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-start text-xs hover:bg-surface-2 ${d.day === data.day ? "bg-surface-2 font-bold" : ""}`}>
                      <span>{dayLabel(d.day)}</span>
                      <span className="h-3 rounded-full bg-gold/70" style={{ width: `${Math.max(2, (d.visitors / max) * 100)}%` }} aria-hidden />
                      <span className="tabular-nums text-text-2">{t("visits.row", { visitors: n(d.visitors), signedIn: n(d.signedIn), pageviews: n(d.pageviews) })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{data.day ? t("visits.users", { day: dayLabel(data.day) }) : t("visits.usersRange", { range: rangeLabel })}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    <Th>{t("visits.name")}</Th><Th>{t("visits.mobile")}</Th><Th>{t("subs.plan")}</Th>
                    {!data.day && <Th>{t("visits.daysCol")}</Th>}
                    <Th>{t(data.day ? "visits.firstLast" : "visits.lastVisit")}</Th><Th>{t("visits.pages")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.length === 0 && <tr><Td className="text-text-2">{t("visits.noUsers")}</Td></tr>}
                  {data.users.map((u) => (
                    <tr key={u.userId} className="border-t border-border">
                      <Td className="font-bold">{u.name ?? "—"}</Td>
                      <Td dir="ltr"><Link to={`/users?q=${u.phone ?? u.userId}`} className="hover:underline">{u.phone ?? "—"}</Link></Td>
                      <Td><Badge tone={u.plan === "gold" ? "gold" : "gray"}>{t(`plan.${u.plan}`)}</Badge></Td>
                      {!data.day && <Td className="tabular-nums">{n(u.days)}</Td>}
                      <Td className="text-xs text-text-2 tabular-nums">
                        {data.day ? `${formatTime(u.firstAt, locale)} – ${formatTime(u.lastAt, locale)}` : `${formatDate(u.lastAt, locale)} ${formatTime(u.lastAt, locale)}`}
                      </Td>
                      <Td className="tabular-nums">{n(u.pageviews)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.day && <p className="px-4 py-2 text-xs text-text-3">{t("visits.keptNote")}</p>}
          </Card>
        </>
      )}
    </Page>
  );
}
