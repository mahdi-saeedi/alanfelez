import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { api, canWritePrices, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { normalizeDigits } from "../amount";
import { Badge, Button, Card, Field, Input, Notice, Page, Select } from "./ui";

type Item = Schemas["AdminCatalogItem"];

/**
 * The product list per metal («لیست محصولات»): pick a metal, then add a product (its price row in the chosen market is
 * created in the same step), rename it, move it to another category, deactivate it, or delete it. Delete works only
 * while nothing has been priced yet; after that a product or row can only be deactivated, so its history stays. Metals
 * can be added, renamed and deleted (only when empty). New rows are never "base" (free tier): that's the owner's
 * decision (tier matrix). Guide: docs/guides/PRICE_ADMIN.fa.md.
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
  const c = catalog.data;
  const [picked, setPicked] = useState<string>();
  const metal = c?.metals.find((m) => m.slug === picked) ?? c?.metals[0];
  const [editing, setEditing] = useState<string>(); // "metal:<slug>" or "product:<slug>"

  const done = () => {
    setEditing(undefined);
    void qc.invalidateQueries({ queryKey: ["admin"] });
  };
  const toggle = useMutation({
    mutationFn: async (v: { kind: "product" | "series"; slug: string; active: boolean }) =>
      ensureOk(await api.POST("/v1/admin/catalog/active", { body: v })),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (v: { kind: "metal" | "product" | "series"; slug: string }) => {
      const params = { params: { path: { slug: v.slug } } };
      if (v.kind === "metal") return ensureOk(await api.DELETE("/v1/admin/metals/{slug}", params));
      if (v.kind === "product") return ensureOk(await api.DELETE("/v1/admin/products/{slug}", params));
      return ensureOk(await api.DELETE("/v1/admin/series/{slug}", params));
    },
    onSuccess: (_, v) => {
      if (v.kind === "metal") setPicked(undefined);
      done();
    },
  });
  const confirmToggle = (kind: "product" | "series", slug: string, active: boolean, label: string) => {
    if (window.confirm(t(active ? "catalog.activateConfirm" : "catalog.deactivateConfirm", { name: label }))) toggle.mutate({ kind, slug, active });
  };
  const confirmRemove = (kind: "metal" | "product" | "series", slug: string, label: string) => {
    if (window.confirm(t(`catalog.deleteConfirm.${kind}`, { name: label }))) remove.mutate({ kind, slug });
  };
  const removeError = remove.error && errorText(remove.error, t, { CONFLICT: `catalog.deleteBlocked.${remove.variables?.kind ?? "product"}` });

  const products = (c?.products ?? []).filter((p) => p.metal === metal?.slug);
  const rowsOf = (product: string) => (series.data ?? []).filter((s) => s.product === product);
  const marketName = (slug: string) => name(c?.markets.find((m) => m.slug === slug) ?? { nameFa: slug });

  return (
    <Page title={t("catalog.title")} hint={t("catalog.hint")}>
      {!writable && roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>}
      {(catalog.isError || series.isError) && <Notice tone="error">{t("table.error")}</Notice>}
      {toggle.error && <Notice tone="error">{errorText(toggle.error, t)}</Notice>}
      {removeError && <Notice tone="error">{removeError}</Notice>}

      <Section title={t("catalog.metals")}>
        <nav aria-label={t("catalog.metals")} className="flex flex-wrap gap-2 p-3">
          {c?.metals.map((m) => (
            <button
              key={m.slug}
              type="button"
              aria-current={m.slug === metal?.slug ? "true" : undefined}
              onClick={() => { setPicked(m.slug); setEditing(undefined); }}
              className={`rounded-full border px-4 py-1.5 text-sm ${m.slug === metal?.slug ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface text-text-2 hover:border-gold"}`}
            >
              {name(m)} <span className="opacity-70">({(c.products.filter((p) => p.metal === m.slug)).length.toLocaleString(locale === "en" ? "en" : "fa")})</span>
            </button>
          ))}
        </nav>
        {writable && <MetalForm />}
      </Section>

      {metal && c && (
        <Section title={t("catalog.productsOf", { metal: name(metal) })}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <code dir="ltr" className="text-xs text-text-3">{metal.slug}</code>
            {writable && editing !== `metal:${metal.slug}` && (
              <span className="ms-auto flex gap-2">
                <Button type="button" tone="ghost" onClick={() => setEditing(`metal:${metal.slug}`)}>{t("catalog.renameMetal")}</Button>
                <Button type="button" tone="danger" disabled={remove.isPending} onClick={() => confirmRemove("metal", metal.slug, name(metal))}>{t("catalog.deleteMetal")}</Button>
              </span>
            )}
          </div>
          {editing === `metal:${metal.slug}` && <RenameForm kind="metal" item={metal} onClose={done} />}

          {writable && <QuickAdd key={metal.slug} metal={metal} categories={c.categories} markets={c.markets} />}

          {products.length === 0 && <p className="p-4 text-sm text-text-3">{t("catalog.noProducts")}</p>}
          {c.categories.map((cat) => {
            const list = products.filter((p) => p.category === cat.slug);
            if (list.length === 0) return null;
            return (
              <div key={cat.slug} className="border-t border-border">
                <h3 className="bg-surface-2 px-3 py-2 text-sm font-extrabold">{name(cat)} <span className="font-normal text-text-3">({list.length.toLocaleString(locale === "en" ? "en" : "fa")})</span></h3>
                <ul>
                  {list.map((p) => (
                    <li key={p.slug} className="border-t border-border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold">{name(p)}</span>{" "}
                          {!p.active && <Badge>{t("prices.inactive")}</Badge>}
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                            <code dir="ltr" className="text-text-3">{p.slug}</code>
                            {rowsOf(p.slug).map((s) => (
                              <span key={s.slug} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                                {marketName(s.market)} · {t(unitKey(s))}
                                {s.isBase && <Badge tone="gold">{t("prices.base")}</Badge>}
                                {!s.active && <Badge>{t("prices.inactive")}</Badge>}
                                {writable && (
                                  <>
                                    <button type="button" className="text-text-3 underline hover:text-text" onClick={() => confirmToggle("series", s.slug, !s.active, `${name(p)} · ${marketName(s.market)}`)}>
                                      {t(s.active ? "catalog.deactivate" : "catalog.activate")}
                                    </button>
                                    {!s.latestAmount && (
                                      <button type="button" className="text-down underline" onClick={() => confirmRemove("series", s.slug, `${name(p)} · ${marketName(s.market)}`)}>{t("catalog.delete")}</button>
                                    )}
                                  </>
                                )}
                              </span>
                            ))}
                            {rowsOf(p.slug).length === 0 && <span className="text-down">{t("catalog.noRow")}</span>}
                          </div>
                        </div>
                        {writable && editing !== `product:${p.slug}` && (
                          <span className="flex flex-wrap gap-2">
                            <Button type="button" tone="ghost" onClick={() => setEditing(`product:${p.slug}`)}>{t("catalog.edit")}</Button>
                            <Button type="button" tone="ghost" disabled={toggle.isPending} onClick={() => confirmToggle("product", p.slug, !p.active, name(p))}>{t(p.active ? "catalog.deactivate" : "catalog.activate")}</Button>
                            <Button type="button" tone="danger" disabled={remove.isPending} onClick={() => confirmRemove("product", p.slug, name(p))}>{t("catalog.delete")}</Button>
                          </span>
                        )}
                      </div>
                      {editing === `product:${p.slug}` && <RenameForm kind="product" item={p} categories={c.categories} onClose={done} />}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {writable && <SeriesForm key={`s-${metal.slug}`} products={products} markets={c.markets} />}
        </Section>
      )}
    </Page>
  );
}

/** "catalog.unit.irrKg" etc.: the row's currency and unit in words. */
function unitKey(s: { currency: string; unit: string }) {
  return `catalog.unit.${s.currency === "USD" ? "usd" : "irr"}${s.unit === "ton" ? "Ton" : "Kg"}`;
}

/** Inline edit of a metal's or a product's names (and a product's category). */
function RenameForm({ kind, item, categories, onClose }: { kind: "metal" | "product"; item: { slug: string; nameFa: string; nameEn?: string; category?: string }; categories?: Item[]; onClose: () => void }) {
  const t = useTranslate();
  const [f, setF] = useState({ nameFa: item.nameFa, nameEn: item.nameEn ?? "", category: item.category ?? "" });
  const save = useMutation({
    mutationFn: async () => {
      const params = { path: { slug: item.slug } };
      const names = { nameFa: f.nameFa.trim(), ...(f.nameEn.trim() ? { nameEn: f.nameEn.trim() } : {}) };
      if (kind === "metal") return ensureOk(await api.PUT("/v1/admin/metals/{slug}", { params, body: names }));
      return ensureOk(await api.PUT("/v1/admin/products/{slug}", { params, body: { ...names, ...(f.category ? { category: f.category } : {}) } }));
    },
    onSuccess: onClose,
  });
  return (
    <form
      className="mt-3 grid gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}
    >
      <Field label={t("catalog.nameFa")}><Input required maxLength={120} value={f.nameFa} onChange={(e) => setF({ ...f, nameFa: e.target.value })} className="w-full" /></Field>
      <Field label={t("catalog.nameEn")}><Input dir="ltr" maxLength={120} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} className="w-full" /></Field>
      {kind === "product" && categories && (
        <Field label={t("catalog.category")}>
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="w-full">
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
          </Select>
        </Field>
      )}
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" tone="gold" disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
        <Button type="button" tone="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        {save.error && <Notice tone="error">{errorText(save.error, t, { NOT_FOUND: "catalog.missingRef" })}</Notice>}
      </div>
    </form>
  );
}

/** A URL-safe id from the English name, or a short unique one when there's none (staff never type ids here). */
function autoSlug(metal: string, nameEn: string) {
  const words = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const tail = words || Date.now().toString(36);
  return `${metal}-${tail}`.slice(0, 50).replace(/-+$/, "");
}

/**
 * «افزودن محصول به لیست»: one form for the common case. Creates the product under this metal and its price row in the
 * chosen market (default «بازار», Toman per kg), so it appears in the price-entry list straight away.
 */
function QuickAdd({ metal, categories, markets }: { metal: Item; categories: Item[]; markets: Item[] }) {
  const t = useTranslate();
  const qc = useQueryClient();
  const empty = {
    nameFa: "",
    nameEn: "",
    category: categories.find((c) => c.slug === "scrap")?.slug ?? categories[0]?.slug ?? "",
    market: markets.find((m) => m.slug === "free")?.slug ?? markets[0]?.slug ?? "",
    unit: "IRR/kg",
  };
  const [f, setF] = useState(empty);
  const [added, setAdded] = useState<string>();
  const run = useMutation({
    mutationFn: async () => {
      const slug = autoSlug(metal.slug, f.nameEn);
      const nameEn = f.nameEn.trim();
      await unwrap(await api.POST("/v1/admin/products", { body: { slug, metal: metal.slug, category: f.category, nameFa: f.nameFa.trim(), ...(nameEn ? { nameEn } : {}) } }));
      const [currency, unit] = f.unit.split("/") as ["IRR" | "USD", "kg" | "ton"];
      await unwrap(await api.POST("/v1/admin/series", { body: { slug: `${slug}-${f.market}`, product: slug, market: f.market, currency, unit, maxJumpBp: 1500 } }));
      return f.nameFa.trim();
    },
    onSuccess: (n) => {
      setAdded(n);
      setF({ ...empty, category: f.category, market: f.market, unit: f.unit });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  return (
    <form
      className="grid gap-3 border-b border-border bg-gold/5 p-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(e: FormEvent) => { e.preventDefault(); setAdded(undefined); run.mutate(); }}
    >
      <h3 className="text-sm font-extrabold sm:col-span-2 lg:col-span-5">{t("catalog.quickAdd", { metal: metal.nameFa })}</h3>
      <Field label={t("catalog.nameFa")}><Input required maxLength={120} value={f.nameFa} onChange={(e) => setF({ ...f, nameFa: e.target.value })} className="w-full" placeholder={t("catalog.nameFaExample")} /></Field>
      <Field label={t("catalog.nameEn")}><Input dir="ltr" maxLength={120} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} className="w-full" /></Field>
      <Field label={t("catalog.category")}>
        <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="w-full">
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.nameFa}</option>)}
        </Select>
      </Field>
      <Field label={t("catalog.market")}>
        <Select value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })} className="w-full">
          {markets.map((m) => <option key={m.slug} value={m.slug}>{m.nameFa}</option>)}
        </Select>
      </Field>
      <Field label={t("catalog.unit")}>
        <Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className="w-full">
          <option value="IRR/kg">{t("catalog.unit.irrKg")}</option>
          <option value="IRR/ton">{t("catalog.unit.irrTon")}</option>
          <option value="USD/ton">{t("catalog.unit.usdTon")}</option>
          <option value="USD/kg">{t("catalog.unit.usdKg")}</option>
        </Select>
      </Field>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
        <Button type="submit" tone="gold" disabled={run.isPending}>{run.isPending ? t("common.saving") : t("catalog.addToList")}</Button>
        {added && <Notice tone="ok">{t("catalog.addedName", { name: added })}</Notice>}
        {run.error && <Notice tone="error">{errorText(run.error, t, { CONFLICT: "catalog.takenName", NOT_FOUND: "catalog.missingRef" })}</Notice>}
        <p className="text-xs text-text-3">{t("catalog.notBase")}</p>
      </div>
    </form>
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

function SeriesForm({ products, markets }: { products: Schemas["AdminProduct"][]; markets: Item[] }) {
  const t = useTranslate();
  const active = products.filter((p) => p.active);
  const empty = { slug: "", product: active[0]?.slug ?? "", market: markets[0]?.slug ?? "", currency: "IRR" as "IRR" | "USD", unit: "kg" as "kg" | "ton", jump: "15" };
  const [f, setF] = useState(empty);
  return (
    <AddForm
      title={t("catalog.addSeriesMore")}
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
