import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Notice, Textarea } from "./ui";
import { DayPicker, addDays, noonOf, todayTehran } from "./dates";

/**
 * The sales team's notes on one customer (client, 2026-11-05): what was said, and a day to call back. Any staff
 * member, sales included, writes them; due follow-ups show on the dashboard.
 */
export function CustomerNotes({ userId }: { userId: string }) {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const notes = useQuery({
    queryKey: ["admin", "notes", userId],
    queryFn: async () => unwrap(await api.GET("/v1/admin/users/{id}/notes", { params: { path: { id: userId } } })).items,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "notes", userId] });
    void qc.invalidateQueries({ queryKey: ["admin", "follow-ups"] });
  };
  const add = useMutation({
    mutationFn: async () => unwrap(await api.POST("/v1/admin/users/{id}/notes", { params: { path: { id: userId } }, body: { body, ...(followUp ? { followUp } : {}) } })),
    onSuccess: () => { setBody(""); setFollowUp(null); refresh(); },
  });
  const done = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => ensureOk(await api.PUT("/v1/admin/customer-notes/{id}", { params: { path: { id } }, body: { done: value } })),
    onSuccess: refresh,
  });
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold">{t("notes.title")}</h2>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(); }}>
        <Textarea value={body} maxLength={2000} rows={3} onChange={(e) => setBody(e.target.value)} placeholder={t("notes.placeholder")} className="w-full" />
        <div className="flex flex-wrap items-center gap-2">
          {followUp === null ? (
            <Button type="button" tone="ghost" onClick={() => setFollowUp(addDays(todayTehran(), 3))}>{t("notes.addFollowUp")}</Button>
          ) : (
            <>
              <DayPicker value={followUp} onChange={setFollowUp} locale={locale} label={t("notes.followUp")} max={addDays(todayTehran(), 365)} />
              <Button type="button" tone="ghost" onClick={() => setFollowUp(null)}>✕</Button>
            </>
          )}
          <span className="flex-1" />
          <Button tone="gold" type="submit" disabled={!body.trim() || add.isPending}>{t("notes.save")}</Button>
        </div>
      </form>
      {(add.isError || done.isError) && <Notice tone="error">{errorText(add.error ?? done.error, t)}</Notice>}
      <ul className="space-y-2">
        {notes.data?.length === 0 && <li className="text-sm text-text-3">{t("notes.none")}</li>}
        {notes.data?.map((n) => (
          <li key={n.id} className="rounded-lg border border-border p-3 text-sm">
            <p className="whitespace-pre-wrap leading-7">{n.body}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-3">
              <span>{n.author} · {formatDate(n.createdAt, locale, true)}</span>
              {n.followUp && (
                <>
                  <Badge tone={n.done ? "green" : n.followUp <= todayTehran() ? "red" : "gold"}>{t("notes.followUpOn", { date: formatDate(noonOf(n.followUp), locale) })}</Badge>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={n.done} onChange={(e) => done.mutate({ id: n.id, value: e.target.checked })} />
                    {t("notes.done")}
                  </label>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The dashboard's «پیگیری‌های امروز»: follow-ups due today or earlier and not done. */
export function DueFollowUps() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const q = useQuery({ queryKey: ["admin", "follow-ups"], queryFn: async () => unwrap(await api.GET("/v1/admin/follow-ups", {})).items, refetchInterval: 120_000 });
  if (!q.data?.length) return null;
  return (
    <Card>
      <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{t("notes.due", { n: q.data.length })}</h2>
      <ul>
        {q.data.slice(0, 10).map((n) => (
          <li key={n.id} className="border-b border-border last:border-0">
            <Link to={`/activity/${n.userId}`} className="block px-4 py-2.5 text-sm hover:bg-surface-2">
              <div className="flex justify-between gap-2"><b>{n.customer}</b>{n.followUp && <span className="text-xs text-down">{formatDate(noonOf(n.followUp), locale)}</span>}</div>
              <p className="line-clamp-1 text-xs text-text-2">{n.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
