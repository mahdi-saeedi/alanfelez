import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canWriteContent, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Card, Input, Notice, Page } from "./ui";

type Status = "pending" | "published" | "hidden";

/**
 * Members' analyses («تحلیل کاربران») and comments. Since 2026-11-02 (client) a new analysis and every member's
 * comment wait for review here: «انتشار» puts it on the site, «رد / پنهان» keeps it off (editor/admin; audited). A
 * published one can still be hidden, and shown again. Waiting ones come first; the page opens on them.
 */
export function CommunityPage() {
  const t = useTranslate();
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const tabChip = (on: boolean) => `rounded-lg px-4 py-2 text-sm font-bold ${on ? "bg-graphite text-white" : "bg-surface-2 text-text-2"}`;
  return (
    <Page title={t("community.title")} hint={t("community.hint")}>
      <div className="flex gap-2">
        <button type="button" className={tabChip(tab === "posts")} onClick={() => setTab("posts")}>{t("community.tabPosts")}</button>
        <button type="button" className={tabChip(tab === "comments")} onClick={() => setTab("comments")}>{t("community.tabComments")}</button>
      </div>
      {tab === "posts" ? <Posts /> : <Comments />}
    </Page>
  );
}

function Posts() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | undefined>("pending");
  const [reported, setReported] = useState(false);
  const [q, setQ] = useState("");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const list = useQuery({
    queryKey: ["admin", "community", status ?? "all", reported, q],
    queryFn: async () =>
      unwrap(await api.GET("/v1/admin/community/posts", { params: { query: { ...(status ? { status } : {}), ...(reported ? { reported } : {}), ...(q ? { q } : {}) } } })),
  });
  const set = useMutation({
    mutationFn: async (v: { id: string; status: "published" | "hidden" }) =>
      ensureOk(await api.PUT("/v1/admin/community/posts/{id}/status", { params: { path: { id: v.id } }, body: { status: v.status } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "community"] }),
  });
  const writable = canWriteContent(roles.data ?? []);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface"}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(["pending", undefined, "published", "hidden"] as const).map((s) => (
          <button key={s ?? "all"} type="button" className={chip(!reported && status === s)} onClick={() => { setStatus(s); setReported(false); }}>
            {t(s ? `community.${s}` : "community.all")}{s === "pending" && list.data?.pending ? ` (${list.data.pending})` : ""}
          </button>
        ))}
        {/* Reported by members: these come first in every list; the chip shows only them. */}
        <button type="button" className={chip(reported)} onClick={() => { setReported(true); setStatus(undefined); }}>
          {t("community.reported")}{list.data?.reportedOpen ? ` (${list.data.reportedOpen})` : ""}
        </button>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("community.search")} className="w-56" />
      </div>
      {list.isError && <Notice tone="error">{errorText(list.error, t)}</Notice>}
      {set.isError && <Notice tone="error">{errorText(set.error, t)}</Notice>}
      {list.data && list.data.items.length === 0 && <p className="text-sm text-text-3">{t("community.none")}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.data?.items.map((p) => (
          <Card key={p.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">{p.authorName}</span>
              <span className="flex gap-1.5">
                {(p.reports ?? 0) > 0 && <Badge tone="red">{t("community.reports").replace("{n}", String(p.reports))}</Badge>}
                <Badge tone={p.status === "published" ? "green" : p.status === "pending" ? "gold" : "red"}>{t(`community.${p.status}`)}</Badge>
              </span>
            </div>
            <h3 className="font-bold">{p.title}</h3>
            <p className="whitespace-pre-line text-sm text-text-2">{p.body}</p>
            {p.hasImage && <PostImage id={p.id} alt={p.title} />}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-3">
              <span>{formatDate(p.createdAt, locale, true)}{p.metal ? ` · ${p.metal.name}` : ""}</span>
              {writable && <ReviewButtons status={p.status} pending={set.isPending} onSet={(s) => set.mutate({ id: p.id, status: s })} />}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/** «انتشار» and «رد» for a waiting item; «پنهان کردن» or «نمایش دوباره» afterwards. */
function ReviewButtons({ status, pending, onSet }: { status: Status; pending: boolean; onSet: (s: "published" | "hidden") => void }) {
  const t = useTranslate();
  const b = "rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-50";
  if (status === "pending") {
    return (
      <span className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => onSet("published")} className={`${b} bg-up-bg text-up`}>{t("community.approve")}</button>
        <button type="button" disabled={pending} onClick={() => onSet("hidden")} className={`${b} bg-down-bg text-down`}>{t("community.reject")}</button>
      </span>
    );
  }
  return (
    <button type="button" disabled={pending} onClick={() => onSet(status === "published" ? "hidden" : "published")} className={`${b} ${status === "published" ? "bg-down-bg text-down" : "bg-surface-2 text-text"}`}>
      {t(status === "published" ? "community.hide" : "community.show")}
    </button>
  );
}

/** Comments on members' analyses and the team's articles, waiting ones first (client, 2026-11-02). */
function Comments() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | undefined>("pending");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const list = useQuery({
    queryKey: ["admin", "comments", status ?? "all"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/comments", { params: { query: status ? { status } : {} } })),
  });
  const set = useMutation({
    mutationFn: async (v: { id: string; status: "published" | "hidden" }) =>
      ensureOk(await api.PUT("/v1/admin/comments/{id}/status", { params: { path: { id: v.id } }, body: { status: v.status } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "comments"] }),
  });
  const writable = canWriteContent(roles.data ?? []);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface"}`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(["pending", undefined, "published", "hidden"] as const).map((s) => (
          <button key={s ?? "all"} type="button" className={chip(status === s)} onClick={() => setStatus(s)}>
            {t(s ? `community.${s}` : "community.all")}{s === "pending" && list.data?.pending ? ` (${list.data.pending})` : ""}
          </button>
        ))}
      </div>
      {list.isError && <Notice tone="error">{errorText(list.error, t)}</Notice>}
      {set.isError && <Notice tone="error">{errorText(set.error, t)}</Notice>}
      {list.data && list.data.items.length === 0 && <p className="text-sm text-text-3">{t("community.noComments")}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.data?.items.map((c) => (
          <Card key={c.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">{c.authorName}{c.staff && <Badge tone="gold">{t("community.staff")}</Badge>}</span>
              <Badge tone={c.status === "published" ? "green" : c.status === "pending" ? "gold" : "red"}>{t(`community.${c.status}`)}</Badge>
            </div>
            <p className="text-xs text-text-3">{t(c.kind === "post" ? "community.onPost" : "community.onArticle")}: <b className="text-text-2">{c.targetTitle}</b></p>
            <p className="whitespace-pre-line text-sm">{c.body}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-3">
              <span>{formatDate(c.createdAt, locale, true)}</span>
              {writable && <ReviewButtons status={c.status} pending={set.isPending} onSet={(s) => set.mutate({ id: c.id, status: s })} />}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/** The post's chart, fetched with the staff token (an <img src> can't send it). */
function PostImage({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    void api.GET("/v1/community/posts/{id}/image", { params: { path: { id } }, parseAs: "blob" }).then((r) => {
      if (r.data) setUrl((u = URL.createObjectURL(r.data as Blob)));
    });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img src={url} alt={alt} className="max-h-64 rounded-lg border border-border object-contain" /> : null;
}
