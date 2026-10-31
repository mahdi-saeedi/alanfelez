"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, formatNumber, parseDecimal, type Locale } from "@alanfelez/ui/format";
import { deleteAction, estimateAction, saveAction } from "@/app/[locale]/calculator/actions";
import { EMPTY_FORM, amountInWords, type CalcForm, type CalcProduct } from "./calc-form";
import { StickyResult } from "./StickyResult";

type Result = Schemas["CalculatorResult"];
type Input = Schemas["CalculatorInput"];
type Saved = Schemas["SavedCalculation"];


/**
 * The load-value calculator (SCOPE §8, design 11). Every change asks the Go API (debounced): the arithmetic lives
 * in one place (internal/calculator) and the result is labeled an estimate. Disabled (a preview) without Gold.
 */
export function Calculator({ products, initial, allowed, saved: initialSaved }: { products: CalcProduct[]; initial: CalcForm; allowed: boolean; saved: Saved[] }) {
  const t = useTranslations("calculator");
  const locale = useLocale() as Locale;
  const [form, setForm] = useState<CalcForm>(initial);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(initialSaved);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);

  const product = products.find((p) => p.series === form.series);
  const [metal, setMetal] = useState(product?.metal.slug ?? products[0]?.metal.slug ?? "");
  const [category, setCategory] = useState(product?.category.slug ?? "");
  const metals = useMemo(() => unique(products.map((p) => p.metal)), [products]);
  const categories = useMemo(() => unique(products.filter((p) => p.metal.slug === metal).map((p) => p.category)), [products, metal]);
  const choices = products.filter((p) => p.metal.slug === metal && (!category || p.category.slug === category));

  const input = toInput(form);
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    if (!allowed) return;
    if (!input) {
      setResult(undefined);
      setError(t("enterInputs"));
      return;
    }
    const n = ++seq.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await estimateAction(input);
        if (n !== seq.current) return; // a newer request is on its way
        setResult(res.result);
        setError(res.error ? t(res.error === "invalid" ? "invalid" : "error") : undefined);
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inputKey stands for input
  }, [inputKey, allowed]);

  const set = <K extends keyof CalcForm>(k: K, v: CalcForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const share = async () => {
    const q = new URLSearchParams(Object.entries(form).filter(([k, v]) => v !== "" && v !== EMPTY_FORM[k as keyof CalcForm]));
    const url = `${window.location.origin}${window.location.pathname}?${q}`;
    history.replaceState(null, "", `?${q}`);
    try {
      await navigator.clipboard.writeText(url);
      flash(t("copied"));
    } catch {
      /* the address bar has the link */
    }
  };
  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(undefined), 2500);
  };
  const save = () =>
    input &&
    startTransition(async () => {
      const res = await saveAction(name || product?.name || t("title"), input);
      if (res.saved) {
        setSaved((s) => [res.saved!, ...s]);
        setName("");
        flash(t("saved"));
      } else setError(t(res.error === "full" ? "full" : res.error === "invalid" ? "invalid" : "error"));
    });
  const remove = (id: string) =>
    startTransition(async () => {
      if (await deleteAction(id)) setSaved((s) => s.filter((c) => c.id !== id));
    });
  const open = (c: Saved) => {
    const i = c.result.input;
    setForm({
      series: i.series ?? "", unit: "kg", weight: String(i.weightGrams / 1000), paidBy: i.shippingPaidBy,
      price: i.series && c.result.price ? "" : String((i.unitPriceRialPerKg ?? 0) / 10),
      impurity: String(i.impurityBp / 100), deductions: String(i.deductionBp / 100), shipping: String(i.shippingRial / 10),
    });
    const p = products.find((x) => x.series === i.series);
    if (p) {
      setMetal(p.metal.slug);
      setCategory(p.category.slug);
    }
  };

  // Free: one worked example from today's free base price (1 ton of the first product), so the box isn't just «—».
  const sample = products.find((p) => p.priceRialPerKg);
  const example = sample?.priceRialPerKg ? { name: sample.name, toman: (sample.priceRialPerKg * 1000) / 10 } : undefined;
  const field = "w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-gold disabled:bg-surface-2";
  const chip = (on: boolean) => `rounded-control border px-3 py-1.5 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface hover:border-gold"}`;

  return (
    <div className={`grid gap-6 ${allowed ? "lg:grid-cols-[1fr_300px]" : ""}`}>
      <fieldset disabled={!allowed} className="min-w-0 space-y-5 rounded-card border border-border bg-surface p-5 shadow-soft sm:p-6">
        {allowed && result && <StickyResult target="calc-result" label={t("resultTitle")} value={`${formatNumber(Math.round(result.valueRial / 10), locale)} ${t("toman")}`} />}
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-bold">{t("metal")}</p>
            <div className="flex flex-wrap gap-2">
              {metals.map((m) => (
                <button key={m.slug} type="button" className={chip(m.slug === metal)} onClick={() => { setMetal(m.slug); setCategory(""); set("series", ""); }}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">{t("category")}</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c.slug} type="button" className={chip(c.slug === category)} onClick={() => { setCategory(c.slug); set("series", ""); }}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-bold">{t("product")}</span>
          <select value={form.series} onChange={(e) => set("series", e.target.value)} className={field}>
            <option value="">{t("choose")}</option>
            {choices.map((p) => <option key={p.series} value={p.series}>{p.name}</option>)}
          </select>
        </label>

        {product && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 px-4 py-3 text-sm">
            <span className="text-text-2">{t("basePrice")}:</span>
            {product.priceRialPerKg ? (
              <span className="text-end">
                <span className="font-extrabold tabular-nums">{formatNumber(Math.round(product.priceRialPerKg / 10), locale)} <span className="text-xs font-normal text-text-2">{t("toman")}/{t("kg")}</span></span>
                {/* Source and last update next to every price (CLAUDE.md). */}
                {product.observedAt && <span className="block text-xs text-text-3">{t("priceFrom", { source: product.source ?? "", time: formatDate(product.observedAt, locale, true) })}</span>}
              </span>
            ) : (
              <span className="text-xs text-text-3">{t("noBase")}</span>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 text-sm">
            <label htmlFor="calc-weight" className="font-bold">{t("weight")}</label>
            <div className="flex gap-2">
              <input id="calc-weight" inputMode="decimal" dir="ltr" value={form.weight} onChange={(e) => set("weight", e.target.value)} className={field} />
              <select aria-label={t("weight")} value={form.unit} onChange={(e) => set("unit", e.target.value as CalcForm["unit"])} className="rounded-control border border-border bg-surface px-3 text-sm">
                <option value="kg">{t("kg")}</option>
                <option value="ton">{t("ton")}</option>
              </select>
            </div>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-bold">{t("manualPrice")}</span>
            <input inputMode="decimal" dir="ltr" value={form.price} placeholder={product?.priceRialPerKg ? String(Math.round(product.priceRialPerKg / 10)) : ""} onChange={(e) => set("price", e.target.value)} className={field} />
            <span className="block text-xs text-text-3">{t("manualHint")}</span>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-bold">{t("impurity")}</span>
            <input inputMode="decimal" dir="ltr" value={form.impurity} onChange={(e) => set("impurity", e.target.value)} className={field} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-bold">{t("deductions")}</span>
            <input inputMode="decimal" dir="ltr" value={form.deductions} onChange={(e) => set("deductions", e.target.value)} className={field} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-bold">{t("shipping")}</span>
            <input inputMode="numeric" dir="ltr" value={form.shipping} onChange={(e) => set("shipping", e.target.value)} className={field} />
          </label>
          <div className="space-y-1.5 text-sm">
            <p className="font-bold">{t("paidBy")}</p>
            <div className="flex flex-wrap gap-2">
              {(["seller", "buyer"] as const).map((p) => (
                <button key={p} type="button" className={chip(form.paidBy === p)} onClick={() => set("paidBy", p)}>{t(p)}</button>
              ))}
            </div>
          </div>
        </div>

        <section id="calc-result" className="scroll-mt-28 rounded-card bg-graphite p-5 text-center text-white" aria-live="polite">
          <p className="text-sm text-silver-light">{t("resultTitle")}</p>
          <p className={`mt-2 text-3xl font-extrabold tabular-nums sm:text-4xl ${pending ? "opacity-60" : ""}`}>
            {result ? formatNumber(Math.round(result.valueRial / 10), locale) : "—"}
          </p>
          <p className="mt-1 text-xs text-silver-light">{t("toman")}</p>
          {result && <p className="mt-1 text-sm font-bold text-gold-light">{amountInWords(Math.round(result.valueRial / 10), locale)}</p>}
          {!allowed && example && (
            <p className="mt-3 text-xs text-silver-light">{t("example", { product: example.name, value: amountInWords(example.toman, locale) })}</p>
          )}
          {error && allowed && <p className="mt-3 text-xs text-gold-light">{error}</p>}
          {result && (
            <dl className="mt-5 grid grid-cols-2 gap-2 text-start sm:grid-cols-4">
              {[
                [t("base"), `${formatNumber(Math.round((result.input.unitPriceRialPerKg ?? 0) / 10), locale)} ${t("toman")}/${t("kg")}`],
                [t("net"), `${formatNumber(result.netWeightGrams / 1000, locale)} ${t("kg")}`],
                [t("deducted"), `${formatNumber(Math.round(result.deductionsRial / 10), locale)} ${t("toman")}`],
                [t("shippingCost"), `${formatNumber(Math.round(result.shippingRial / 10), locale)} ${t("toman")}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-control bg-graphite-2 px-3 py-2">
                  <dt className="text-xs text-silver-light">{k}</dt>
                  <dd className="text-sm font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {result?.price && (
            <p className="mt-3 text-xs text-silver-light">
              {t("priceFrom", { source: result.price.source ?? result.price.product, time: formatDate(result.price.observedAt, locale, true) })}
            </p>
          )}
          <p className="mt-3 text-xs text-silver-light">{t("estimate")}</p>
        </section>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("saveName")} className={field} />
          <button type="button" onClick={save} disabled={!result || pending} className="rounded-control border border-border px-4 py-2.5 text-sm font-bold hover:border-gold disabled:opacity-50">{t("save")}</button>
          <button type="button" onClick={share} className="rounded-control border border-border px-4 py-2.5 text-sm font-bold hover:border-gold">{t("share")}</button>
          <button type="button" onClick={() => setForm(EMPTY_FORM)} className="rounded-control bg-graphite px-4 py-2.5 text-sm font-bold text-white hover:bg-graphite-2">{t("reset")}</button>
        </div>
        {notice && <p role="status" className="text-sm text-up">{notice}</p>}
      </fieldset>

      {allowed && (
        <aside className="h-fit rounded-card border border-border bg-surface p-4 shadow-soft">
          <h2 className="mb-3 font-bold">{t("savedTitle")}</h2>
          {saved.length === 0 ? (
            <p className="text-sm text-text-2">{t("noSaved")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {saved.map((c) => (
                <li key={c.id} className="py-2.5 text-sm">
                  <button type="button" onClick={() => open(c)} className="block min-h-9 text-start font-bold hover:text-gold-dark">{c.name}</button>
                  <div className="text-xs text-text-3">
                    {formatNumber(c.result.input.weightGrams / 1000, locale)} {t("kg")} · {formatDate(c.createdAt, locale)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold tabular-nums">{formatNumber(Math.round(c.result.valueRial / 10), locale)} {t("toman")}</span>
                    <button type="button" onClick={() => remove(c.id)} className="min-h-9 px-2 text-xs text-text-3 hover:text-down">{t("delete")}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}

/** The API input from what's typed, or undefined when something is missing or not a number. */
function toInput(f: CalcForm): Input | undefined {
  const weight = parseDecimal(f.weight);
  const impurity = parseDecimal(f.impurity || "0");
  const deductions = parseDecimal(f.deductions || "0");
  const shipping = parseDecimal(f.shipping || "0");
  const price = f.price.trim() ? parseDecimal(f.price) : undefined;
  if (weight === undefined || impurity === undefined || deductions === undefined || shipping === undefined) return undefined;
  if (f.price.trim() && price === undefined) return undefined;
  if (!f.series && price === undefined) return undefined;
  return {
    ...(f.series ? { series: f.series } : {}),
    ...(price !== undefined ? { unitPriceRialPerKg: Math.round(price * 10) } : {}),
    weightGrams: Math.round(weight * (f.unit === "ton" ? 1_000_000 : 1000)),
    impurityBp: Math.round(impurity * 100),
    deductionBp: Math.round(deductions * 100),
    shippingRial: Math.round(shipping * 10),
    shippingPaidBy: f.paidBy,
  };
}

function unique(list: { slug: string; name: string }[]) {
  const seen = new Map<string, { slug: string; name: string }>();
  for (const x of list) if (!seen.has(x.slug)) seen.set(x.slug, x);
  return [...seen.values()];
}
