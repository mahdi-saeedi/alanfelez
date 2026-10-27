import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import { formatDate, formatNumber, formatTime, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { Badge, Card, Notice, Page, Td, Th } from "./ui";

/**
 * Visitor stats (client, 2026-10-27): today's visitors, signed-in visitors and page views, the last 30 days, and who
 * of the signed-in users came on a chosen day. Anonymous visitors are counted without cookies and can't be named.
 */
export function VisitsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [day, setDay] = useState<string>();
  const stats = useQuery({
    queryKey: ["admin", "visits", day ?? "today"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/visits", { params: { query: day ? { day } : {} } })),
    refetchInterval: 60_000,
  });
  const data = stats.data;
  const today = data?.days.find((d) => d.day === data.day) ?? { visitors: 0, signedIn: 0, pageviews: 0 };
  const max = Math.max(1, ...(data?.days.map((d) => d.visitors) ?? []));
  const dayLabel = (d: string) => formatDate(`${d}T12:00:00Z`, locale);
  const n = (v: number) => formatNumber(v, locale);

  return (
    <Page title={t("visits.title")} hint={t("visits.hint")}>
      {stats.isError && <Notice tone="error">{errorText(stats.error, t)}</Notice>}
      {data && (
        <>
          <p className="text-sm font-bold">{dayLabel(data.day)}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([["visitors", today.visitors], ["signedIn", today.signedIn], ["pageviews", today.pageviews]] as const).map(([k, v]) => (
              <Card key={k} className="p-4">
                <div className="text-xs text-text-2">{t(`visits.${k}`)}</div>
                <div className="mt-1 text-2xl font-extrabold tabular-nums">{n(v)}</div>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-bold">{t("visits.last30")}</h2>
            {data.days.length === 0 ? (
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
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("visits.users", { day: dayLabel(data.day) })}</h2>
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr><Th>{t("visits.name")}</Th><Th>{t("visits.mobile")}</Th><Th>{t("subs.plan")}</Th><Th>{t("visits.firstLast")}</Th><Th>{t("visits.pages")}</Th></tr>
              </thead>
              <tbody>
                {data.users.length === 0 && <tr><Td className="text-text-2">{t("visits.noUsers")}</Td></tr>}
                {data.users.map((u) => (
                  <tr key={u.userId} className="border-t border-border">
                    <Td className="font-bold">{u.name ?? "—"}</Td>
                    <Td dir="ltr"><Link to={`/users?q=${u.phone ?? u.userId}`} className="hover:underline">{u.phone ?? "—"}</Link></Td>
                    <Td><Badge tone={u.plan === "gold" ? "gold" : "gray"}>{t(`plan.${u.plan}`)}</Badge></Td>
                    <Td className="text-xs text-text-2 tabular-nums">{formatTime(u.firstAt, locale)} – {formatTime(u.lastAt, locale)}</Td>
                    <Td className="tabular-nums">{n(u.pageviews)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </Page>
  );
}
