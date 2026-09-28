import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { api, canWriteContent, currentRoles, errorText, unwrap } from "../api";
import { Button, Card, Input, Notice, Page } from "./ui";

type Category = Schemas["AdminCategory"];
type Kind = "faq" | "article";

/** Article topic tabs (besides metals) on the analysis page. */
export function ArticleCategoriesPage() {
  const t = useTranslate();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const list = useQuery({ queryKey: ["admin", "article-categories"], queryFn: async () => unwrap(await api.GET("/v1/admin/article-categories", {})).items });
  return (
    <Page title={t("categories.title")} hint={t("categories.hint")}>
      <div className="max-w-xl">
        <CategoryEditor
          kind="article"
          categories={list.data ?? []}
          writable={canWriteContent(roles.data ?? [])}
          onChange={() => qc.invalidateQueries({ queryKey: ["admin", "article-categories"] })}
        />
      </div>
    </Page>
  );
}

/** Add, rename and reorder categories. The slug is fixed once created (it's in URLs). */
export function CategoryEditor({ kind, categories, writable, onChange }: { kind: Kind; categories: Category[]; writable: boolean; onChange: () => void }) {
  const t = useTranslate();
  return (
    <Card className="h-fit">
      <h2 className="border-b border-border px-4 py-3 font-bold">{t("categories.list")}</h2>
      <ul className="divide-y divide-border">
        {categories.map((c) => (
          <li key={c.slug} className="px-4 py-2"><Row kind={kind} initial={c} writable={writable} onSaved={onChange} /></li>
        ))}
      </ul>
      {writable && (
        <div className="border-t border-border bg-surface-2 px-4 py-3">
          <p className="mb-2 text-xs font-bold text-text-2">{t("categories.add")}</p>
          <Row kind={kind} writable onSaved={onChange} />
        </div>
      )}
    </Card>
  );
}

function Row({ kind, initial, writable, onSaved }: { kind: Kind; initial?: Category; writable: boolean; onSaved: () => void }) {
  const t = useTranslate();
  const blank: Category = { slug: "", nameFa: "", nameEn: "", sort: 100 };
  const [v, setV] = useState<Category>(initial ?? blank);
  const save = useMutation({
    mutationFn: async () => {
      const body = { ...v, nameEn: v.nameEn || undefined };
      if (initial) {
        const path = { params: { path: { slug: initial.slug } }, body };
        return unwrap(kind === "faq" ? await api.PUT("/v1/admin/faq/categories/{slug}", path) : await api.PUT("/v1/admin/article-categories/{slug}", path));
      }
      return unwrap(kind === "faq" ? await api.POST("/v1/admin/faq/categories", { body }) : await api.POST("/v1/admin/article-categories", { body }));
    },
    onSuccess: () => {
      if (!initial) setV(blank);
      onSaved();
    },
  });
  const dirty = !initial || v.nameFa !== initial.nameFa || (v.nameEn ?? "") !== (initial.nameEn ?? "") || v.sort !== initial.sort;
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input required dir="ltr" disabled={!!initial || !writable} placeholder="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })} className="w-28" />
        <Input required disabled={!writable} placeholder={t("categories.nameFa")} value={v.nameFa} onChange={(e) => setV({ ...v, nameFa: e.target.value })} className="min-w-32 flex-1" />
        <Input dir="ltr" disabled={!writable} placeholder={t("categories.nameEn")} value={v.nameEn ?? ""} onChange={(e) => setV({ ...v, nameEn: e.target.value })} className="min-w-32 flex-1" />
        <Input type="number" disabled={!writable} title={t("faq.sort")} value={v.sort} onChange={(e) => setV({ ...v, sort: Number(e.target.value) })} className="w-16" />
        {writable && dirty && <Button type="submit" tone={initial ? "dark" : "gold"} disabled={save.isPending}>{t("common.save")}</Button>}
      </div>
      {save.isError && <Notice tone="error">{errorText(save.error, t, { CONFLICT: "categories.slugTaken" })}</Notice>}
    </form>
  );
}
