import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { api, canWritePrices, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { normalizeDigits } from "../amount";
import { Badge, Button, Card, Field, Input, Notice, Page, Select, Td, Th } from "./ui";

type Item = Schemas["AdminCatalogItem"];

/**
 * Metals, products and price rows (series): add new ones, and deactivate or reactivate products and rows. Nothing is
 * deleted; an inactive product or row leaves the site and keeps its history. New rows are never "base" (free tier):
 * that's the owner's decision (tier matrix). Guide: docs/guides/PRICE_ADMIN.fa.md.
 */
export function CatalogPage() {
  const t = useTranslate();
  const locale = useGetLocale()();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWritePrices(roles.data ?? []);
  const catalog = useQuery({ queryKey: ["admin", "catalog"], queryFn: async () => unwrap(await api.GET("/v1/admin/catalog")) });
  const series = useQuery({ queryKey: ["admin", "series"], queryFn: async () => unwrap(await api.GET("/v1/admin/series")).items });
  const name = (i: { nameFa: string; nameEn?: string }) => (locale === "en" && i.nameEn ? i.nameEn : i.nameFa);
  const byslug = (list: Item[] | undefined, slug: string) => list?.find((i) => i.slug === slug);

  const toggle = useMutation({
    mutationFn: async (v: { kind: "product" | "series"; slug: string; active: boolean }) =>
      ensureOk(await api.POST("/v1/admin/catalog/active", { body: v })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  const confirmToggle = (kind: "product" | "series", slug: string, active: boolean, label: string) => {
    if (window.confirm(t(active ? "catalog.activateConfirm" : "catalog.deactivateConfirm", { name: label }))) toggle.mutate({ kind, slug, active });
  };
  const c = catalog.data;

  return (
    <Page title={t("catalog.title")} hint={t("catalog.hint")}>
      {!writable && roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>}
      {(catalog.isError || series.isError) && <Notice tone="error">{t("table.error")}</Notice>}
      {toggle.error && <Notice tone="error">{errorText(toggle.error, t)}</Notice>}

      <Section title={t("catalog.metals")}>
        <div className="flex flex-wrap gap-2 p-3">
          {c?.metals.map((m) => <Badge key={m.slug}>{name(m)} <code dir="ltr">{m.slug}</code></Badge>)}
        </div>
        {writable && <MetalForm />}
      </Section>

      <Section title={t("catalog.products")}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("catalog.name")}</Th><Th>{t("catalog.metal")}</Th><Th>{t("catalog.category")}</Th><Th>{t("catalog.state")}</Th><Th /></tr>
          </thead>
          <tbody>
            {c?.products.map((p) => (
              <tr key={p.slug} className="border-t border-border">
                <Td><div className="font-bold">{name(p)}</div><code className="text-xs text-text-3" dir="ltr">{p.slug}</code></Td>
                <Td>{name(byslug(c.metals, p.metal) ?? { nameFa: p.metal })}</Td>
                <Td>{name(byslug(c.categories, p.category) ?? { nameFa: p.category })}</Td>
                <Td><Badge tone={p.active ? "green" : "gray"}>{t(p.active ? "catalog.active" : "prices.inactive")}</Badge></Td>
                <Td>{writable && <Button type="button" tone={p.active ? "danger" : "ghost"} disabled={toggle.isPending} onClick={() => confirmToggle("product", p.slug, !p.active, name(p))}>{t(p.active ? "catalog.deactivate" : "catalog.activate")}</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {writable && c && <ProductForm metals={c.metals} categories={c.categories} />}
      </Section>

      <Section title={t("catalog.series")}>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("catalog.name")}</Th><Th>{t("catalog.market")}</Th><Th>{t("catalog.unit")}</Th><Th>{t("catalog.state")}</Th><Th /></tr>
          </thead>
          <tbody>
            {series.data?.map((s) => (
              <tr key={s.slug} className="border-t border-border">
                <Td><div className="font-bold">{locale === "en" && s.productEn ? s.productEn : s.productFa}</div><code className="text-xs text-text-3" dir="ltr">{s.slug}</code></Td>
                <Td>{name(byslug(c?.markets, s.market) ?? { nameFa: s.market })}</Td>
                <Td dir="ltr">{s.currency === "USD" ? "$ / ton" : "Toman / kg"}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1"><Badge tone={s.active ? "green" : "gray"}>{t(s.active ? "catalog.active" : "prices.inactive")}</Badge>
                  {s.isBase && <Badge tone="gold">{t("prices.base")}</Badge>}</span>
                </Td>
                <Td>{writable && <Button type="button" tone={s.active ? "danger" : "ghost"} disabled={toggle.isPending} onClick={() => confirmToggle("series", s.slug, !s.active, s.productFa)}>{t(s.active ? "catalog.deactivate" : "catalog.activate")}</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {writable && c && <SeriesForm products={c.products} markets={c.markets} />}
      </Section>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <Card>{children}</Card>
    </section>
  );
}

/** One "add" form: fields, a submit button, the result. `save` throws on a problem (shown translated). */
function AddForm({ title, children, save, onDone }: { title: string; children: ReactNode; save: () => Promise<unknown>; onDone: () => void }) {
  const t = useTranslate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: save,
    onSuccess: () => {
      onDone();
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
  if (!open) {
    return <div className="border-t border-border p-3"><Button type="button" tone="gold" onClick={() => setOpen(true)}>{title}</Button></div>;
  }
  return (
    <form
      className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        run.mutate();
      }}
    >
      {children}
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" tone="gold" disabled={run.isPending}>{run.isPending ? t("common.saving") : t("common.save")}</Button>
        <Button type="button" tone="ghost" onClick={() => { setOpen(false); run.reset(); }}>{t("common.cancel")}</Button>
        {run.isSuccess && <Notice tone="ok">{t("catalog.added")}</Notice>}
        {run.error && <Notice tone="error">{errorText(run.error, t, { CONFLICT: "catalog.taken", NOT_FOUND: "catalog.missingRef" })}</Notice>}
      </div>
    </form>
  );
}

const slugOk = (s: string) => /^[a-z0-9-]{2,80}$/.test(s);

function SlugField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslate();
  return (
    <Field label={t("catalog.slug")} hint={t("catalog.slugHint")}>
      <Input dir="ltr" required value={value} onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="w-full" />
    </Field>
  );
}

function MetalForm() {
  const t = useTranslate();
  const [f, setF] = useState({ slug: "", nameFa: "", nameEn: "" });
  return (
    <AddForm
      title={t("catalog.addMetal")}
      onDone={() => setF({ slug: "", nameFa: "", nameEn: "" })}
      save={async () => {
        if (!slugOk(f.slug)) throw Object.assign(new Error(t("catalog.slugHint")), { problem: { code: "LOCAL" } });
        return unwrap(await api.POST("/v1/admin/metals", { body: { slug: f.slug, nameFa: f.nameFa, ...(f.nameEn ? { nameEn: f.nameEn } : {}) } }));
      }}
    >
      <Field label={t("catalog.nameFa")}><Input required value={f.nameFa} onChange={(e) => setF({ ...f, nameFa: e.target.value })} className="w-full" /></Field>
      <Field label={t("catalog.nameEn")}><Input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} className="w-full" /></Field>
      <SlugField value={f.slug} onChange={(slug) => setF({ ...f, slug })} />
    </AddForm>
  );
}

function ProductForm({ metals, categories }: { metals: Item[]; categories: Item[] }) {
  const t = useTranslate();
  const empty = { slug: "", metal: metals[0]?.slug ?? "", category: categories[0]?.slug ?? "", nameFa: "", nameEn: "" };
  const [f, setF] = useState(empty);
  return (
    <AddForm
      title={t("catalog.addProduct")}
      onDone={() => setF(empty)}
      save={async () => {
        if (!slugOk(f.slug)) throw Object.assign(new Error(t("catalog.slugHint")), { problem: { code: "LOCAL" } });
        return unwrap(await api.POST("/v1/admin/products", { body: { slug: f.slug, metal: f.metal, category: f.category, nameFa: f.nameFa, ...(f.nameEn ? { nameEn: f.nameEn } : {}) } }));
      }}
    >
      <Field label={t("catalog.nameFa")}><Input required value={f.nameFa} onChange={(e) => setF({ ...f, nameFa: e.target.value })} className="w-full" /></Field>
      <Field label={t("catalog.nameEn")}><Input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} className="w-full" /></Field>
      <SlugField value={f.slug} onChange={(slug) => setF({ ...f, slug })} />
      <Field label={t("catalog.metal")}>
        <Select value={f.metal} onChange={(e) => setF({ ...f, metal: e.target.value })} className="w-full">
          {metals.map((m) => <option key={m.slug} value={m.slug}>{m.nameFa}</option>)}
        </Select>
      </Field>
      <Field label={t("catalog.category")}>
        <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="w-full">
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
        </Select>
      </Field>
    </AddForm>
  );
}

function SeriesForm({ products, markets }: { products: Schemas["AdminProduct"][]; markets: Item[] }) {
  const t = useTranslate();
  const active = products.filter((p) => p.active);
  const empty = { slug: "", product: active[0]?.slug ?? "", market: markets[0]?.slug ?? "", currency: "IRR" as "IRR" | "USD", unit: "kg" as "kg" | "ton", jump: "15" };
  const [f, setF] = useState(empty);
  return (
    <AddForm
      title={t("catalog.addSeries")}
      onDone={() => setF(empty)}
      save={async () => {
        if (!slugOk(f.slug)) throw Object.assign(new Error(t("catalog.slugHint")), { problem: { code: "LOCAL" } });
        const pct = Number(normalizeDigits(f.jump));
        if (!Number.isFinite(pct) || pct < 1 || pct > 100) throw Object.assign(new Error(t("catalog.jumpHint")), { problem: { code: "LOCAL" } });
        return unwrap(await api.POST("/v1/admin/series", {
          body: { slug: f.slug, product: f.product, market: f.market, currency: f.currency, unit: f.unit, maxJumpBp: Math.round(pct * 100) },
        }));
      }}
    >
      <Field label={t("catalog.product")}>
        <Select value={f.product} onChange={(e) => setF({ ...f, product: e.target.value, slug: f.slug || `${e.target.value}-${f.market}` })} className="w-full">
          {active.map((p) => <option key={p.slug} value={p.slug}>{p.nameFa}</option>)}
        </Select>
      </Field>
      <Field label={t("catalog.market")}>
        <Select value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })} className="w-full">
          {markets.map((m) => <option key={m.slug} value={m.slug}>{m.nameFa}</option>)}
        </Select>
      </Field>
      <Field label={t("catalog.unit")}>
        <Select
          value={`${f.currency}/${f.unit}`}
          onChange={(e) => {
            const [currency, unit] = e.target.value.split("/") as ["IRR" | "USD", "kg" | "ton"];
            setF({ ...f, currency, unit });
          }}
          className="w-full"
        >
          <option value="IRR/kg">{t("catalog.unit.irrKg")}</option>
          <option value="IRR/ton">{t("catalog.unit.irrTon")}</option>
          <option value="USD/ton">{t("catalog.unit.usdTon")}</option>
          <option value="USD/kg">{t("catalog.unit.usdKg")}</option>
        </Select>
      </Field>
      <SlugField value={f.slug} onChange={(slug) => setF({ ...f, slug })} />
      <Field label={t("catalog.jump")} hint={t("catalog.jumpHint")}>
        <Input dir="ltr" inputMode="decimal" value={f.jump} onChange={(e) => setF({ ...f, jump: e.target.value })} className="w-24" />
      </Field>
      <p className="self-end text-xs text-text-3">{t("catalog.notBase")}</p>
    </AddForm>
  );
}
