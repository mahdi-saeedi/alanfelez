import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import { formatDate, formatNumber, formatToman, type Locale } from "@alanfelez/ui/format";
import { DayBars } from "./charts";
import { DueFollowUps } from "./Notes";
import { api, errorText, unwrap } from "../api";
import { Button, Card, Notice, Page } from "./ui";
import { Bar, DayPicker, RangePicker, type Range, addDays, lastDays, metalColor, noonOf, todayTehran } from "./dates";

/**
 * The admin home page (client 2026-11-03): one day's numbers (any past day can be picked) or a from–to range's
 * (client 2026-11-08), what waits for staff now, and which metals visitors looked at.
 */
export function Dashboard() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [day, setDay] = useState(todayTehran());
  const [ranged, setRanged] = useState(false);
  const [range, setRange] = useState<Range>(lastDays(7));
  const isRange = ranged && range.from < range.to;
  const q = useQuery({
    queryKey: ["admin", "dashboard", isRange ? `${range.from}..${range.to}` : day],
    queryFn: async () => unwrap(await api.GET("/v1/admin/dashboard", { params: { query: isRange ? { day: range.to, from: range.from } : { day } } })),
    refetchInterval: 60_000,
  });
  const d = q.data;
  const n = (v: number) => formatNumber(v, locale);
  const isToday = (isRange ? range.to : day) === todayTehran();
  const days = d ? d.trend.length : 0;
  const change = (cur: number, prev: number) => {
    if (!prev) return null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    const text = isRange ? t("dash.vsPrevRange", { pct: n(Math.abs(pct)), days: n(days) }) : t("dash.vsPrev", { pct: n(Math.abs(pct)) });
    return <em className={`not-italic text-xs font-bold ${pct >= 0 ? "text-up" : "text-down"}`}>{pct >= 0 ? "▲" : "▼"} {text}</em>;
  };
  const maxMetal = Math.max(1, ...(d?.metals.map((m) => m.views) ?? []));
  const pending: [string, number, string][] = d ? [
    ["dash.pendingPosts", d.pending.posts, "/content/community"],
    ["dash.pendingComments", d.pending.comments, "/content/community"],
    ["dash.tickets", d.pending.tickets, "/support/tickets"],
    ["dash.messages", d.pending.messages, "/support/messages"],
    ["dash.quarantined", d.pending.quarantined, "/prices/quarantine"],
  ] : [];

  return (
    <Page title={t("dash.title")} hint={t("dash.hint")}>
      <div className="flex flex-wrap gap-1">
        <Button type="button" tone={ranged ? "ghost" : "gold"} onClick={() => setRanged(false)}>{t("dash.modeDay")}</Button>
        <Button type="button" tone={ranged ? "gold" : "ghost"} onClick={() => setRanged(true)}>{t("dash.modeRange")}</Button>
      </div>
      {ranged ? (
        <RangePicker value={range} onChange={setRange} locale={locale} />
      ) : (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" tone="ghost" onClick={() => setDay(addDays(day, -1))}>{t("dash.prevDay")}</Button>
        <DayPicker value={day} onChange={setDay} locale={locale} label={t("dash.day")} />
        <Button type="button" tone="ghost" disabled={isToday} onClick={() => setDay(addDays(day, 1))}>{t("dash.nextDay")}</Button>
        {!isToday && <Button type="button" tone="gold" onClick={() => setDay(todayTehran())}>{t("range.today")}</Button>}
        <span className="text-sm font-bold text-text-2">{formatDate(noonOf(day), locale)}</span>
      </div>
      )}
      {q.isError && <Notice tone="error">{errorText(q.error, t)}</Notice>}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="space-y-1 p-4">
              <div className="text-xs text-text-2">{t("dash.visitors")}{isRange && <span className="text-text-3"> ({t("dash.sumNote")})</span>}</div>
              <div className="text-2xl font-extrabold tabular-nums">{n(d.visitors)}</div>
              {change(d.visitors, d.prevVisitors)}
            </Card>
            <Card className="space-y-1 p-4">
              <div className="text-xs text-text-2">{t("dash.signedIn")}{isRange && <span className="text-text-3"> ({t("dash.sumNote")})</span>}</div>
              <div className="text-2xl font-extrabold tabular-nums">{n(d.signedIn)}</div>
              {change(d.signedIn, d.prevSignedIn)}
            </Card>
            <Card className="space-y-1 p-4">
              <div className="text-xs text-text-2">{t(isRange ? "dash.signupsRange" : "dash.signups")}</div>
              <div className="text-2xl font-extrabold tabular-nums">{n(isRange ? d.signups : d.signups7d)}</div>
              <em className="not-italic text-xs text-text-3">{isRange ? t("dash.signupsPrevRange", { n: n(d.signupsPrev), days: n(days) }) : t("dash.signupsPrev", { n: n(d.signupsPrev7d) })}</em>
            </Card>
            <Card className="space-y-1 p-4">
              <div className="text-xs text-text-2">{t("dash.plans")}</div>
              <div className="text-2xl font-extrabold tabular-nums">{n(d.silver)} / {n(d.gold)}</div>
              {d.expiring7d > 0 && <Link to="/subscriptions" className="block text-xs font-bold text-down hover:underline">{t("dash.expiring", { n: n(d.expiring7d) })}</Link>}
            </Card>
          </div>

          {/* The 30 days up to the day (client, 2026-11-05): visitors, sign-ups and revenue. */}
          <div className="grid gap-3 lg:grid-cols-3">
            {([
              ["dash.trendVisitors", d.trend.map((x) => x.visitors), "#5f8fb3", undefined],
              ["dash.trendSignups", d.trend.map((x) => x.signups), "#16a34a", undefined],
              ["dash.trendRevenue", d.trend.map((x) => Number(BigInt(x.revenue.amount) / 10n)), "#c9a227", (v: number) => formatToman(String(v * 10), locale)],
            ] as const).map(([k, values, color, format]) => (
              <Card key={k} className="space-y-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold">{t(isRange ? `${k}Range` : k)}</h2>
                  <b className="text-sm tabular-nums">{format ? format(values.reduce((a, b) => a + b, 0)) : n(values.reduce((a, b) => a + b, 0))}</b>
                </div>
                <DayBars days={d.trend.map((x) => x.day)} series={[{ label: t(k), color, values: [...values] }]} locale={locale} height={90} format={format} />
              </Card>
            ))}
          </div>

          <DueFollowUps />
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("dash.waiting")}</h2>
              <ul>
                {pending.map(([k, v, to]) => (
                  <li key={k} className="border-b border-border last:border-0">
                    <Link to={to} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-2">
                      {t(k)}
                      <span className={`rounded-full px-2.5 text-xs font-extrabold tabular-nums ${v ? "bg-down-bg text-down" : "bg-up-bg text-up"}`}>{n(v)}</span>
                    </Link>
                  </li>
                ))}
                <li className="px-4 py-2.5 text-sm">
                  <Link to="/prices" className="flex items-center justify-between hover:underline">
                    {t("dash.missing")}
                    <span className={`rounded-full px-2.5 text-xs font-extrabold tabular-nums ${d.missingPrices.length ? "bg-down-bg text-down" : "bg-up-bg text-up"}`}>{n(d.missingPrices.length)}</span>
                  </Link>
                  {d.missingPrices.length > 0 && (
                    <p className="mt-1 text-xs text-text-2">{d.missingPrices.slice(0, 8).map((m) => `${m.name} (${m.market})`).join(locale === "fa" ? "، " : ", ")}{d.missingPrices.length > 8 ? "…" : ""}</p>
                  )}
                </li>
              </ul>
            </Card>
            <Card>
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t(isRange ? "dash.metalsRange" : isToday ? "dash.metalsToday" : "dash.metalsDay")}</h2>
              <div className="space-y-2 p-4">
                {d.metals.length === 0 && <p className="text-sm text-text-3">{t("dash.noMetals")}</p>}
                {d.metals.map((m) => (
                  <Bar key={m.metal} label={t(`signup.metal.${m.metal}`, m.metal)} value={m.views} max={maxMetal} color={metalColor(m.metal)} text={n(m.views)} />
                ))}
                <p className="pt-1 text-xs text-text-3">{t("dash.metalsNote")}</p>
              </div>
            </Card>
          </div>
          <p className="text-xs text-text-3">{t(isRange ? "dash.rangeNote" : isToday ? "dash.waitingNote" : "dash.pastNote")}</p>
        </>
      )}
    </Page>
  );
}
