import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canWriteContent, currentRoles, errorText, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Select, Td, Th } from "./ui";
import { RichEditor } from "./RichEditor";

type Input = Schemas["AdminArticleInput"];
type Type = Schemas["ArticleType"];
type Status = Schemas["ArticleStatus"];

const TYPES: Type[] = ["news", "analysis", "forecast"];
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
              <Field plain label={t("articles.f.body")}><RichEditor key="fa" dir="rtl" value={v.bodyFa} onChange={(h) => set("bodyFa", h)} minHeight={360} /></Field>
              <Field label={t("articles.f.author")}><Input maxLength={100} value={v.authorFa ?? ""} onChange={(e) => set("authorFa", e.target.value)} className="w-full" /></Field>
            </>
          ) : (
            <div dir="ltr" className="space-y-4">
              <Field label={t("articles.f.title")}><Input maxLength={200} value={v.titleEn ?? ""} onChange={(e) => set("titleEn", e.target.value)} className="w-full" /></Field>
              <Field label={t("articles.f.summary")}>
                <textarea maxLength={600} rows={2} value={v.summaryEn ?? ""} onChange={(e) => set("summaryEn", e.target.value)} className="w-full rounded-lg border border-border p-2 text-sm" />
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
          <Field label={t("articles.f.cover")} hint={t("articles.f.coverHint")}>
            <Input dir="ltr" maxLength={500} value={v.coverUrl ?? ""} onChange={(e) => set("coverUrl", e.target.value)} className="w-full" placeholder="https://" />
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
