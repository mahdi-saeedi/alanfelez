import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { PricesView } from "@/components/prices/PricesView";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ metal?: string; category?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "prices" });
  return seo(locale, "/prices", { title: t("title"), description: t("subtitle") });
}

/** Every metal's prices. The old ?metal= links move to the metal's own page (/prices/copper). */
export default async function PricesPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const { metal, category } = await searchParams;
  if (metal && /^[a-z0-9-]{1,40}$/.test(metal)) {
    const q = category ? `?category=${encodeURIComponent(category)}` : "";
    permanentRedirect(`${locale === "en" ? "/en" : ""}/prices/${metal}${q}`);
  }
  setRequestLocale(locale);
  const t = await getTranslations("prices");
  return <PricesView locale={locale} category={category} title={t("title")} subtitle={t("subtitle")} />;
}
