import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canWriteContent, currentRoles, errorText, unwrap } from "../api";
import { Badge, Card, Input, Notice, Page } from "./ui";

type Status = "published" | "hidden";

/**
 * Members' analyses («تحلیل کاربران», client 2026-10-30): published at once, so staff check them here and hide an
 * unsuitable one (editor/admin; audited). Hiding takes it off the site; «نمایش دوباره» brings it back.
 */
export function CommunityPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>();
  const [reported, setReported] = useState(false);
  const [q, setQ] = useState("");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const list = useQuery({
    queryKey: ["admin", "community", status ?? "all", reported, q],
    queryFn: async () =>
      unwrap(await api.GET("/v1/admin/community/posts", { params: { query: { ...(status ? { status } : {}), ...(reported ? { reported } : {}), ...(q ? { q } : {}) } } })),
  });
  const set = useMutation({
    mutationFn: async (v: { id: string; status: Status }) =>
      unwrap(await api.PUT("/v1/admin/community/posts/{id}/status", { params: { path: { id: v.id } }, body: { status: v.status } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "community"] }),
  });
  const writable = canWriteContent(roles.data ?? []);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface"}`;

  return (
    <Page title={t("community.title")} hint={t("community.hint")}>
      <div className="flex flex-wrap items-center gap-2">
        {([undefined, "published", "hidden"] as const).map((s) => (
          <button key={s ?? "all"} type="button" className={chip(!reported && status === s)} onClick={() => { setStatus(s); setReported(false); }}>{t(s ? `community.${s}` : "community.all")}</button>
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
                <Badge tone={p.status === "published" ? "green" : "red"}>{t(`community.${p.status}`)}</Badge>
              </span>
            </div>
            <h3 className="font-bold">{p.title}</h3>
            <p className="whitespace-pre-line text-sm text-text-2">{p.body}</p>
            {p.hasImage && p.status === "published" && <PostImage id={p.id} alt={p.title} />}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-3">
              <span>{formatDate(p.createdAt, locale, true)}{p.metal ? ` · ${p.metal.name}` : ""}</span>
              {writable && (
                <button
                  type="button"
                  disabled={set.isPending}
                  onClick={() => set.mutate({ id: p.id, status: p.status === "published" ? "hidden" : "published" })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ${p.status === "published" ? "bg-down-bg text-down" : "bg-surface-2 text-text"}`}
                >
                  {t(p.status === "published" ? "community.hide" : "community.show")}
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Page>
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
