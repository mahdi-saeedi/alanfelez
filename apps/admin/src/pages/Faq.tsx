import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { api, canWriteContent, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Select } from "./ui";
import { RichEditor } from "./RichEditor";
import { CategoryEditor } from "./Categories";

type Item = Schemas["AdminFaqItem"];
type ItemInput = Schemas["AdminFaqInput"];

/**
 * FAQ (FAQ.docx): categories, questions, order, «سوالات پر تکرار» (popular) and published. A question's slug is its
 * permanent deep link (/faq#slug), so it's set once and never changes; unpublish instead of deleting.
 */
export function FaqPage() {
  const t = useTranslate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Item | "new">();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWriteContent(roles.data ?? []);
  const faq = useQuery({ queryKey: ["admin", "faq"], queryFn: async () => unwrap(await api.GET("/v1/admin/faq", {})) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "faq"] });
  const done = () => {
    setEditing(undefined);
    refresh();
  };
  const cats = faq.data?.categories ?? [];

  return (
    <Page title={t("faq.title")} hint={t("faq.hint")}>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {writable && <Button tone="gold" onClick={() => setEditing("new")}>{t("faq.new")}</Button>}
          {editing === "new" && <ItemForm key="new" categories={cats} writable={writable} onDone={done} />}
          {cats.map((c) => {
            const items = faq.data?.items.filter((i) => i.category === c.slug) ?? [];
            return (
              <Card key={c.slug}>
                <h2 className="border-b border-border px-4 py-3 font-bold">{c.nameFa} <span className="text-xs font-normal text-text-3">({items.length})</span></h2>
                <ul className="divide-y divide-border">
                  {items.map((i) => (
                    <li key={i.id}>
                      {editing !== "new" && editing?.id === i.id ? (
                        <div className="p-2"><ItemForm key={i.id} item={i} categories={cats} writable={writable} onDone={done} /></div>
                      ) : (
                      <button type="button" onClick={() => setEditing(i)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface-2">
                        <span className="w-8 text-xs text-text-3 tabular-nums">{i.sort}</span>
                        <span className="flex-1">{i.questionFa}</span>
                        {i.popular && <Badge tone="gold">{t("faq.popular")}</Badge>}
                        {!i.published && <Badge tone="gray">{t("faq.hidden")}</Badge>}
                        {!i.questionEn && <Badge tone="red">{t("faq.noEnglish")}</Badge>}
                      </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {faq.isError && <Notice tone="error">{errorText(faq.error, t)}</Notice>}
        </div>
        <CategoryEditor kind="faq" categories={cats} writable={writable} onChange={refresh} />
      </div>
    </Page>
  );
}

function ItemForm({ item, categories, writable, onDone }: { item?: Item; categories: Schemas["AdminCategory"][]; writable: boolean; onDone: () => void }) {
  const t = useTranslate();
  const [v, setV] = useState<ItemInput>(
    item ?? { slug: "", category: categories[0]?.slug ?? "", questionFa: "", answerFa: "", popular: false, published: true, sort: 100 },
  );
  const set = <K extends keyof ItemInput>(k: K, value: ItemInput[K]) => setV((s) => ({ ...s, [k]: value }));
  const save = useMutation({
    mutationFn: async () => {
      const body = { ...v, questionEn: v.questionEn || undefined, answerEn: v.answerEn || undefined };
      return item
        ? unwrap(await api.PUT("/v1/admin/faq/items/{id}", { params: { path: { id: item.id } }, body }))
        : unwrap(await api.POST("/v1/admin/faq/items", { body }));
    },
    onSuccess: onDone,
  });
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.DELETE("/v1/admin/faq/items/{id}", { params: { path: { id: item!.id } } })),
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4 rounded-card border border-gold/50 bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t("faq.slug")} hint={item ? t("faq.slugFixed") : t("faq.slugHint")}>
          <Input required dir="ltr" disabled={!!item} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={v.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className="w-full" />
        </Field>
        <Field label={t("faq.category")}>
          <Select value={v.category} onChange={(e) => set("category", e.target.value)} className="w-full">
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
          </Select>
        </Field>
        <Field label={t("faq.sort")}><Input type="number" value={v.sort} onChange={(e) => set("sort", Number(e.target.value))} className="w-full" /></Field>
      </div>
      <Field label={t("faq.questionFa")}><Input required minLength={3} maxLength={300} value={v.questionFa} onChange={(e) => set("questionFa", e.target.value)} className="w-full" /></Field>
      <Field plain label={t("faq.answerFa")}><RichEditor dir="rtl" value={v.answerFa} onChange={(h) => set("answerFa", h)} minHeight={120} /></Field>
      <div dir="ltr" className="space-y-4">
        <Field label={t("faq.questionEn")}><Input maxLength={300} value={v.questionEn ?? ""} onChange={(e) => set("questionEn", e.target.value)} className="w-full" /></Field>
        <Field plain label={t("faq.answerEn")}><RichEditor dir="ltr" value={v.answerEn ?? ""} onChange={(h) => set("answerEn", h)} minHeight={120} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.popular} onChange={(e) => set("popular", e.target.checked)} />{t("faq.popular")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.published} onChange={(e) => set("published", e.target.checked)} />{t("faq.published")}</label>
      </div>
      {(save.isError || remove.isError) && <Notice tone="error">{errorText(save.error ?? remove.error, t, { CONFLICT: "faq.slugTaken" })}</Notice>}
      <div className="flex flex-wrap gap-2">
        {writable && <Button tone="gold" type="submit" disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>}
        <Button type="button" tone="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        {writable && item && (
          <Button type="button" tone="danger" className="ms-auto" disabled={remove.isPending} onClick={() => window.confirm(t("faq.deleteConfirm")) && remove.mutate()}>
            {t("faq.delete")}
          </Button>
        )}
      </div>
    </form>
  );
}
