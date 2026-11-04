import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canWriteContent, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Select, Td, Th } from "./ui";
import { RichEditor } from "./RichEditor";

type Input = Schemas["AdminArticleInput"];
type Type = Schemas["ArticleType"];
type Status = Schemas["ArticleStatus"];

const TYPES: Type[] = ["news", "analysis", "forecast", "article"];
const STATUSES: Status[] = ["draft", "published", "archived"];

/** News, analyses and forecasts (SCOPE §10). The type decides who can read the body on the site (news = everyone). */
export function ArticlesPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [type, setType] = useState<Type | "">("");
  const [status, setStatus] = useState<Status | "">("");
  const [q, setQ] = useState("");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const list = useQuery({
    queryKey: ["admin", "articles", type, status, q],
    queryFn: async () => unwrap(await api.GET("/v1/admin/articles", { params: { query: { ...(type ? { type } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}) } } })).items,
  });

  return (
    <Page title={t("articles.title")} hint={t("articles.hint")}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value as Type | "")}>
          <option value="">{t("articles.allTypes")}</option>
          {TYPES.map((x) => <option key={x} value={x}>{t(`articles.type.${x}`)}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
          <option value="">{t("articles.allStatuses")}</option>
          {STATUSES.map((x) => <option key={x} value={x}>{t(`articles.status.${x}`)}</option>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("articles.search")} className="w-56" />
        {canWriteContent(roles.data ?? []) && (
          <Link to="/content/articles/new" className="ms-auto rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-graphite hover:bg-gold-light">{t("articles.new")}</Link>
        )}
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("articles.titleCol")}</Th><Th>{t("articles.typeCol")}</Th><Th>{t("articles.statusCol")}</Th><Th>{t("articles.topic")}</Th><Th>{t("articles.published")}</Th><Th>{t("articles.updated")}</Th></tr>
          </thead>
          <tbody>
            {list.isLoading && <tr><Td className="text-text-2">{t("table.loading")}</Td></tr>}
            {list.data?.length === 0 && <tr><Td className="text-text-2">{t("table.empty")}</Td></tr>}
            {list.data?.map((a) => (
              <tr key={a.id} className="border-t border-border">
                <Td>
                  <Link to={`/content/articles/${a.id}`} className="font-bold hover:text-gold-dark">{a.titleFa}</Link>
                  <div className="text-xs text-text-3" dir="ltr">{a.slug}{a.featured ? " ★" : ""}</div>
                </Td>
                <Td><Badge tone={a.type === "news" ? "gray" : "gold"}>{t(`articles.type.${a.type}`)}</Badge></Td>
                <Td><Badge tone={a.status === "published" ? "green" : a.status === "draft" ? "gold" : "gray"}>{t(`articles.status.${a.status}`)}</Badge></Td>
                <Td className="text-xs" dir="ltr">{a.metal ?? a.category ?? "—"}</Td>
                <Td className="text-xs">{a.publishedAt ? formatDate(a.publishedAt, locale, true) : "—"}</Td>
                <Td className="text-xs">{formatDate(a.updatedAt, locale, true)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {list.isError && <Notice tone="error">{errorText(list.error, t)}</Notice>}
    </Page>
  );
}

const EMPTY: Input = { type: "news", slug: "", status: "draft", featured: false, titleFa: "", summaryFa: "", bodyFa: "" };

/** Create or edit one article. Bodies are HTML from the editor; the API sanitizes them on save. */
export function ArticleEditPage() {
  const { id } = useParams();
  const isNew = id === "new";
  const loaded = useQuery({
    queryKey: ["admin", "article", id],
    enabled: !isNew,
    queryFn: async () => unwrap(await api.GET("/v1/admin/articles/{id}", { params: { path: { id: id! } } })),
  });
  if (!isNew && !loaded.data) return <p className="text-text-2">{loaded.isError ? errorText(loaded.error, (k) => k) : "…"}</p>;
  return <ArticleForm key={loaded.data?.updatedAt ?? "new"} initial={loaded.data ?? EMPTY} id={isNew ? undefined : id} />;
}

function ArticleForm({ initial, id }: { initial: Input & { readMinutes?: number }; id?: string }) {
  const t = useTranslate();
  const nav = useNavigate();
  const justCreated = (useLocation().state as { saved?: boolean } | null)?.saved === true;
  const qc = useQueryClient();
  const [v, setV] = useState<Input>(initial);
  const [lang, setLang] = useState<"fa" | "en">("fa");
  const set = <K extends keyof Input>(k: K, value: Input[K]) => setV((s) => ({ ...s, [k]: value }));
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const metals = useQuery({ queryKey: ["metals"], queryFn: async () => unwrap(await api.GET("/v1/metals", {})).items });
  const cats = useQuery({ queryKey: ["admin", "article-categories"], queryFn: async () => unwrap(await api.GET("/v1/admin/article-categories", {})).items });
  const save = useMutation({
    mutationFn: async (body: Input) =>
      id
        ? unwrap(await api.PUT("/v1/admin/articles/{id}", { params: { path: { id } }, body }))
        : unwrap(await api.POST("/v1/admin/articles", { body })),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["admin", "articles"] });
      qc.setQueryData(["admin", "article", a.id], a);
      if (!id) nav(`/content/articles/${a.id}`, { replace: true, state: { saved: true } });
    },
  });
  const writable = canWriteContent(roles.data ?? []);
  const clean = (body: Input): Input => Object.fromEntries(Object.entries(body).filter(([, x]) => x !== "" && x !== undefined && x !== null)) as Input;

  return (
    <Page title={id ? t("articles.edit") : t("articles.new")} hint={t("articles.editHint")}>
      <Link to="/content/articles" className="text-sm text-text-2 hover:text-gold-dark">{t("common.back")}</Link>
      <form
        className="grid gap-4 lg:grid-cols-[1fr_280px]"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(clean(v));
        }}
      >
        <div className="space-y-4">
          <div className="flex gap-1">
            {(["fa", "en"] as const).map((l) => (
              <Button key={l} type="button" tone={l === lang ? "dark" : "ghost"} onClick={() => setLang(l)}>{t(`common.lang.${l}`)}</Button>
            ))}
          </div>
          {lang === "fa" ? (
            <>
              <Field label={t("articles.f.title")}><Input required minLength={3} maxLength={200} value={v.titleFa} onChange={(e) => set("titleFa", e.target.value)} className="w-full" /></Field>
              <Field label={t("articles.f.summary")} hint={t("articles.f.summaryHint")}>
                <textarea maxLength={600} rows={2} value={v.summaryFa} onChange={(e) => set("summaryFa", e.target.value)} className="w-full rounded-lg border border-border p-2 text-sm" />
              </Field>
              <Field label={t("articles.f.keywords")} hint={t("articles.f.keywordsHint")}>
                <Input maxLength={200} value={v.keywordsFa ?? ""} onChange={(e) => set("keywordsFa", e.target.value)} className="w-full" />
              </Field>
              <Field plain label={t("articles.f.body")}><RichEditor key="fa" dir="rtl" value={v.bodyFa} onChange={(h) => set("bodyFa", h)} minHeight={360} /></Field>
              <Field label={t("articles.f.author")}><Input maxLength={100} value={v.authorFa ?? ""} onChange={(e) => set("authorFa", e.target.value)} className="w-full" /></Field>
            </>
          ) : (
            <div dir="ltr" className="space-y-4">
              <Field label={t("articles.f.title")}><Input maxLength={200} value={v.titleEn ?? ""} onChange={(e) => set("titleEn", e.target.value)} className="w-full" /></Field>
              <Field label={t("articles.f.summary")}>
                <textarea maxLength={600} rows={2} value={v.summaryEn ?? ""} onChange={(e) => set("summaryEn", e.target.value)} className="w-full rounded-lg border border-border p-2 text-sm" />
              </Field>
              <Field label={t("articles.f.keywords")}>
                <Input maxLength={200} value={v.keywordsEn ?? ""} onChange={(e) => set("keywordsEn", e.target.value)} className="w-full" />
              </Field>
              <Field plain label={t("articles.f.body")}><RichEditor key="en" dir="ltr" value={v.bodyEn ?? ""} onChange={(h) => set("bodyEn", h)} minHeight={360} /></Field>
              <Field label={t("articles.f.author")}><Input maxLength={100} value={v.authorEn ?? ""} onChange={(e) => set("authorEn", e.target.value)} className="w-full" /></Field>
            </div>
          )}
        </div>

        <aside className="space-y-4 rounded-card border border-border bg-surface p-4">
          <Field label={t("articles.typeCol")} hint={t(`articles.typeHint.${v.type}`)}>
            <Select value={v.type} onChange={(e) => set("type", e.target.value as Type)} className="w-full">
              {TYPES.map((x) => <option key={x} value={x}>{t(`articles.type.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("articles.statusCol")}>
            <Select value={v.status} onChange={(e) => set("status", e.target.value as Status)} className="w-full">
              {STATUSES.map((x) => <option key={x} value={x}>{t(`articles.status.${x}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("articles.f.slug")} hint={t("articles.f.slugHint")}>
            <Input required dir="ltr" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} value={v.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className="w-full" />
          </Field>
          <Field label={t("articles.f.metal")}>
            <Select value={v.metal ?? ""} onChange={(e) => set("metal", e.target.value || undefined)} className="w-full">
              <option value="">—</option>
              {metals.data?.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label={t("articles.f.category")}>
            <Select value={v.category ?? ""} onChange={(e) => set("category", e.target.value || undefined)} className="w-full">
              <option value="">—</option>
              {cats.data?.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
            </Select>
          </Field>
          <Field label={t("articles.f.outlook")} hint={t("articles.f.outlookHint")}>
            <Select value={v.outlook ?? ""} onChange={(e) => set("outlook", (e.target.value || undefined) as Input["outlook"])} className="w-full">
              <option value="">—</option>
              {(["up", "down", "neutral"] as const).map((o) => <option key={o} value={o}>{t(`articles.outlook.${o}`)}</option>)}
            </Select>
          </Field>
          <Field plain label={t("articles.f.image")} hint={t("articles.f.imageHint")}>
            {id ? <ArticleImage id={id} hasImage={!!initial.coverUrl?.startsWith("/api/articles/")} writable={writable} /> : <p className="text-xs text-text-3">{t("articles.f.imageAfterSave")}</p>}
          </Field>
          <Field plain label={t("articles.f.videoFile")} hint={t("articles.f.videoFileHint")}>
            {id ? (
              <ArticleVideo id={id} uploads={!!(initial as { videoUploads?: boolean }).videoUploads} fileUrl={(initial as { videoFileUrl?: string }).videoFileUrl} writable={writable} />
            ) : (
              <p className="text-xs text-text-3">{t("articles.f.imageAfterSave")}</p>
            )}
          </Field>
          <Field label={t("articles.f.video")} hint={t("articles.f.videoHint")}>
            <Input dir="ltr" maxLength={300} value={v.videoUrl ?? ""} onChange={(e) => set("videoUrl", e.target.value)} className="w-full" placeholder="https://www.aparat.com/v/…" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.featured} onChange={(e) => set("featured", e.target.checked)} />
            {t("articles.f.featured")}
          </label>
          {initial.readMinutes !== undefined && <p className="text-xs text-text-3">{t("articles.f.readMinutes", { n: initial.readMinutes })}</p>}
          {save.isError && <Notice tone="error">{errorText(save.error, t, { CONFLICT: "articles.slugTaken" })}</Notice>}
          {(save.isSuccess || (justCreated && save.isIdle)) && <Notice tone="ok">{t("common.saved")}</Notice>}
          {writable ? (
            <Button tone="gold" type="submit" disabled={save.isPending} className="w-full">{save.isPending ? t("common.saving") : t("common.save")}</Button>
          ) : (
            roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>
          )}
        </aside>
      </form>
    </Page>
  );
}

/**
 * The article's picture (client, 2026-11-04): uploaded on its own (not with the form), so the article must be saved
 * first. JPEG, PNG or GIF up to 5 MB; the API re-encodes it. With a video, the site shows it with a play button.
 */
function ArticleImage({ id, hasImage, writable }: { id: string; hasImage: boolean; writable: boolean }) {
  const t = useTranslate();
  const qc = useQueryClient();
  const [version, setVersion] = useState(hasImage ? 1 : 0);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!version) return setUrl(undefined);
    let u: string | undefined;
    void api.GET("/v1/admin/articles/{id}/image", { params: { path: { id } }, parseAs: "blob" }).then((r) => {
      if (r.data) setUrl((u = URL.createObjectURL(r.data as Blob)));
    });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id, version]);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "articles"] });
  };
  const upload = useMutation({
    mutationFn: async (file: File) =>
      ensureOk(await api.PUT("/v1/admin/articles/{id}/image", {
        params: { path: { id } },
        body: file as unknown as string,
        bodySerializer: (b: unknown) => b as BodyInit,
        headers: { "Content-Type": "application/octet-stream" },
      })),
    onSuccess: () => { setVersion((n) => n + 1); done(); },
  });
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.DELETE("/v1/admin/articles/{id}/image", { params: { path: { id } } })),
    onSuccess: () => { setVersion(0); done(); },
  });
  return (
    <div className="space-y-2">
      {url ? <img src={url} alt="" className="aspect-video w-full rounded-lg border border-border object-cover" /> : <div className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-border text-xs text-text-3">{t("articles.f.noImage")}</div>}
      {writable && (
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
            {upload.isPending ? t("common.saving") : url ? t("articles.f.replaceImage") : t("articles.f.uploadImage")}
            <input type="file" accept="image/jpeg,image/png,image/gif" className="sr-only" disabled={upload.isPending}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload.mutate(f); }} />
          </label>
          {url && (
            <Button type="button" tone="danger" disabled={remove.isPending} onClick={() => { if (confirm(t("articles.f.removeImageConfirm"))) remove.mutate(); }}>
              {t("articles.f.removeImage")}
            </Button>
          )}
        </div>
      )}
      {(upload.isError || remove.isError) && <Notice tone="error">{errorText(upload.error ?? remove.error, t)}</Notice>}
    </div>
  );
}

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
const MAX_VIDEO = 500 * 1024 * 1024;

/**
 * The article's video file (client, 2026-11-04: on our own storage). The browser uploads it straight to the object
 * storage with a signed link from the API (with progress), then attaches it. Played on the site with the picture as
 * its cover. The Aparat link below is the other option.
 */
function ArticleVideo({ id, uploads, fileUrl, writable }: { id: string; uploads: boolean; fileUrl?: string; writable: boolean }) {
  const t = useTranslate();
  const qc = useQueryClient();
  const [url, setUrl] = useState(fileUrl);
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();
  const reload = async () => {
    const a = unwrap(await api.GET("/v1/admin/articles/{id}", { params: { path: { id } } }));
    setUrl((a as { videoFileUrl?: string }).videoFileUrl);
    void qc.invalidateQueries({ queryKey: ["admin", "articles"] });
  };
  const upload = async (file: File) => {
    setError(undefined);
    if (!VIDEO_TYPES.includes(file.type as (typeof VIDEO_TYPES)[number])) return setError(t("articles.f.videoType"));
    if (file.size > MAX_VIDEO) return setError(t("articles.f.videoSize"));
    try {
      setProgress(0);
      const start = unwrap(await api.POST("/v1/admin/articles/{id}/video", {
        params: { path: { id } },
        body: { contentType: file.type as (typeof VIDEO_TYPES)[number], size: file.size },
      }));
      // XMLHttpRequest, not fetch: it reports upload progress (a video can take minutes).
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", start.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("upload failed"));
        xhr.send(file);
      });
      ensureOk(await api.PUT("/v1/admin/articles/{id}/video", { params: { path: { id } }, body: { key: start.key } }));
      await reload();
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith("upload") ? t("articles.f.videoUploadFailed") : errorText(e, t));
    } finally {
      setProgress(undefined);
    }
  };
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.DELETE("/v1/admin/articles/{id}/video", { params: { path: { id } } })),
    onSuccess: () => void reload(),
  });
  if (!uploads) return <p className="text-xs text-text-3">{t("articles.f.videoOff")}</p>;
  return (
    <div className="space-y-2">
      {url ? (
        <video src={url} controls preload="metadata" className="aspect-video w-full rounded-lg border border-border bg-black" />
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-border text-xs text-text-3">{t("articles.f.noVideo")}</div>
      )}
      {progress !== undefined && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {writable && (
        <div className="flex flex-wrap gap-2">
          <label className={`rounded-lg border border-border px-3 py-1.5 text-sm ${progress !== undefined ? "opacity-50" : "cursor-pointer hover:bg-surface-2"}`}>
            {progress !== undefined ? t("articles.f.videoUploading", { n: progress }) : url ? t("articles.f.replaceVideo") : t("articles.f.uploadVideo")}
            <input type="file" accept={VIDEO_TYPES.join(",")} className="sr-only" disabled={progress !== undefined}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </label>
          {url && progress === undefined && (
            <Button type="button" tone="danger" disabled={remove.isPending} onClick={() => { if (confirm(t("articles.f.removeVideoConfirm"))) remove.mutate(); }}>
              {t("articles.f.removeVideo")}
            </Button>
          )}
        </div>
      )}
      {(error || remove.isError) && <Notice tone="error">{error ?? errorText(remove.error, t)}</Notice>}
    </div>
  );
}
