import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canWriteContent, currentRoles, errorText, problemOf, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Td, Th } from "./ui";
import { RichEditor } from "./RichEditor";

type PageInput = Schemas["AdminPageInput"];

/** Static pages: about, terms, privacy, licenses. Every save keeps the previous text as a revision. */
export function PagesPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const list = useQuery({ queryKey: ["admin", "pages"], queryFn: async () => unwrap(await api.GET("/v1/admin/pages", {})).items });
  return (
    <Page title={t("pages.title")} hint={t("pages.hint")}>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("pages.page")}</Th><Th>{t("pages.version")}</Th><Th>{t("pages.state")}</Th><Th>{t("articles.updated")}</Th></tr>
          </thead>
          <tbody>
            {list.data?.map((p) => (
              <tr key={p.slug} className="border-t border-border">
                <Td>
                  <Link to={`/content/pages/${p.slug}`} className="font-bold hover:text-gold-dark">{p.titleFa}</Link>
                  <div className="text-xs text-text-3" dir="ltr">/{p.slug}</div>
                </Td>
                <Td className="tabular-nums">{p.version}</Td>
                <Td><Badge tone={p.published ? "green" : "gray"}>{t(p.published ? "pages.published" : "pages.unpublished")}</Badge></Td>
                <Td className="text-xs">{formatDate(p.updatedAt, locale, true)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Notice tone="warn">{t("pages.licensesNote")}</Notice>
    </Page>
  );
}

export function PageEditPage() {
  const { slug } = useParams();
  const loaded = useQuery({ queryKey: ["admin", "page", slug], queryFn: async () => unwrap(await api.GET("/v1/admin/pages/{slug}", { params: { path: { slug: slug! } } })) });
  if (!loaded.data) return <p className="text-text-2">{loaded.isError ? errorText(loaded.error, (k) => k) : "…"}</p>;
  return <PageForm key={slug} slug={slug!} initial={loaded.data} />;
}

function PageForm({ slug, initial }: { slug: string; initial: Schemas["AdminPage"] }) {
  const t = useTranslate();
  const qc = useQueryClient();
  const [v, setV] = useState<PageInput>(initial);
  const [lang, setLang] = useState<"fa" | "en">("fa");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const save = useMutation({
    mutationFn: async () =>
      unwrap(await api.PUT("/v1/admin/pages/{slug}", { params: { path: { slug } }, body: { ...v, titleEn: v.titleEn || undefined, bodyEn: v.bodyEn || undefined } })),
    onSuccess: (p) => {
      setV((s) => ({ ...s, version: p.version })); // the next save builds on this version
      qc.setQueryData(["admin", "page", slug], p);
      qc.invalidateQueries({ queryKey: ["admin", "pages"] });
    },
  });
  const conflict = problemOf(save.error)?.code === "CONFLICT";

  return (
    <Page title={initial.titleFa} hint={t("pages.editHint")}>
      <Link to="/content/pages" className="text-sm text-text-2 hover:text-gold-dark">{t("common.back")}</Link>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {(["fa", "en"] as const).map((l) => (
            <Button key={l} type="button" tone={l === lang ? "dark" : "ghost"} onClick={() => setLang(l)}>{t(`common.lang.${l}`)}</Button>
          ))}
          <span className="ms-auto text-xs text-text-3">{t("pages.versionOf", { n: v.version })}</span>
        </div>
        {lang === "fa" ? (
          <>
            <Field label={t("pages.pageTitle")}><Input required value={v.titleFa} onChange={(e) => setV({ ...v, titleFa: e.target.value })} className="w-full" /></Field>
            <Field plain label={t("pages.body")}><RichEditor key="fa" dir="rtl" value={v.bodyFa} onChange={(h) => setV((s) => ({ ...s, bodyFa: h }))} minHeight={480} /></Field>
          </>
        ) : (
          <div dir="ltr" className="space-y-4">
            <Field label={t("pages.pageTitle")}><Input value={v.titleEn ?? ""} onChange={(e) => setV({ ...v, titleEn: e.target.value })} className="w-full" /></Field>
            <Field plain label={t("pages.body")}><RichEditor key="en" dir="ltr" value={v.bodyEn ?? ""} onChange={(h) => setV((s) => ({ ...s, bodyEn: h }))} minHeight={480} /></Field>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.published} onChange={(e) => setV({ ...v, published: e.target.checked })} />
          {t("pages.published")}
        </label>
        {save.isError && <Notice tone="error">{conflict ? t("pages.conflict") : errorText(save.error, t)}</Notice>}
        {save.isSuccess && <Notice tone="ok">{t("common.saved")}</Notice>}
        {canWriteContent(roles.data ?? []) ? (
          <Button tone="gold" type="submit" disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
        ) : (
          roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>
        )}
      </form>
    </Page>
  );
}
