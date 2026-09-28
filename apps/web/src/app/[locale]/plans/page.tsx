import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatToman } from "@alanfelez/ui/format";
import { api } from "@/lib/api";

// Rendered per request (no API needed at build time); API responses are cached for 300s in Next's data cache.
export const dynamic = "force-dynamic";
const CACHE = { next: { revalidate: 300 } } as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("nav.plans") };
}

export default async function PlansPage({ params }: { params: Promise<{ locale: "fa" | "en" }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const { data } = await api.GET("/v1/plans", { params: { header: { "Accept-Language": locale } }, ...CACHE });

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-center text-3xl font-extrabold">{t("plans.title")}</h1>
      <p className="mt-3 text-center text-text-2">{t("plans.subtitle")}</p>
      {!data ? (
        <p className="mt-8 text-center text-down">{t("error.apiDown")}</p>
      ) : (
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {data.items.map((plan) => (
            <li
              key={plan.code}
              className={`rounded-card border bg-surface p-6 ${plan.code === "gold" ? "border-2 border-gold shadow-card" : "border-border"}`}
            >
              <h2 className={`text-xl font-extrabold ${plan.code === "gold" ? "text-gold-dark" : ""}`}>{plan.name}</h2>
              {plan.prices.length === 0 ? (
                <p className="mt-4 text-2xl font-extrabold">{t("plans.free")}</p>
              ) : (
                <ul className="mt-4 grid gap-2">
                  {plan.prices.map((p) => (
                    <li key={p.period} className="flex justify-between gap-4 text-sm">
                      <span className="text-text-2">{t(`plans.${p.period}`)}</span>
                      <span className="font-bold">{formatToman(p.price.amount, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
