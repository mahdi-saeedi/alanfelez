import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { getBasePrices, getEntitlements, getPrices, type PriceRow } from "@/lib/prices";
import { getMyCalculations } from "@/lib/gold";
import { Calculator } from "@/components/gold/Calculator";
import { EMPTY_FORM, type CalcForm, type CalcProduct } from "@/components/gold/calc-form";
import { Locked } from "@/components/Locked";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<Partial<Record<keyof CalcForm, string>>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "calculator" });
  return { title: t("title"), description: t("subtitle"), alternates: { languages: { fa: "/calculator", en: "/en/calculator" } } };
}

/**
 * Load-value calculator (SCOPE §5 #6, §8). Gold: the form prices loads through the API and saves them. Others see
 * the same form disabled, with the upgrade box (the API refuses estimates for them anyway).
 */
export default async function CalculatorPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("calculator");
  const tl = await getTranslations("lock");
  const ent = await getEntitlements();
  const allowed = ent?.features["calculator.use"] === true;
  // Gold sees every domestic product; the preview only needs the free base products.
  const [prices, saved] = await Promise.all([allowed ? getPrices(locale) : getBasePrices(locale), allowed ? getMyCalculations() : []]);
  const products = (prices?.items ?? []).filter((r) => r.series.currency === "IRR").map(toProduct);
  const initial: CalcForm = {
    ...EMPTY_FORM,
    ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => k in EMPTY_FORM && typeof v === "string" && v.length <= 40)),
  };
  if (initial.unit !== "kg" && initial.unit !== "ton") initial.unit = "kg";
  if (initial.paidBy !== "seller" && initial.paidBy !== "buyer") initial.paidBy = "seller";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-text-2">{t("subtitle")}</p>
      </header>
      {!allowed && (
        <div className="mb-6">
          <Locked plan="gold" title={t("lockedTitle", { plan: tl("plan.gold") })}>
            {t("lockedBody", { plan: tl("plan.gold") })}
          </Locked>
        </div>
      )}
      <Calculator products={products} initial={initial} allowed={allowed} saved={saved} />
    </div>
  );
}

function toProduct(r: PriceRow): CalcProduct {
  let perKg: number | undefined;
  if (r.price) perKg = r.series.unit === "ton" ? Number(r.price.amount) / 1000 : Number(r.price.amount);
  return {
    series: r.series.slug,
    name: r.series.product.name,
    metal: { slug: r.series.metal.slug, name: r.series.metal.name },
    category: { slug: r.series.category.slug, name: r.series.category.name },
    priceRialPerKg: perKg,
  };
}
