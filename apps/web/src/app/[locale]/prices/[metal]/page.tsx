import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { getMetals } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { PricesView, type PricesQuery } from "@/components/prices/PricesView";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale; metal: string }>; searchParams: Promise<PricesQuery> };

async function metalOf(locale: Locale, slug: string) {
  return (await getMetals(locale)).find((m) => m.slug === slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, metal } = await params;
  const m = await metalOf(locale, metal);
  if (!m) return {};
  const t = await getTranslations({ locale, namespace: "prices" });
  return seo(locale, `/prices/${m.slug}`, { title: t("metalTitle", { metal: m.name }), description: t("metalSubtitle", { metal: m.name }) });
}

/**
 * One metal's prices at its own address («قیمت مس امروز», client 2026-10-27), for search engines: the /prices page
 * filtered to that metal, same look; only the heading and the page title name the metal.
 */
export default async function MetalPricesPage({ params, searchParams }: Params) {
  const { locale, metal } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const m = await metalOf(locale, metal);
  if (!m) notFound();
  const t = await getTranslations("prices");
  const tn = await getTranslations("nav");
  const base = `${SITE_URL}${locale === "en" ? "/en" : ""}`;
  // Breadcrumbs for search results (not shown on the page).
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: tn("home"), item: `${base}/` },
      { "@type": "ListItem", position: 2, name: tn("prices"), item: `${base}/prices` },
      { "@type": "ListItem", position: 3, name: m.name, item: `${base}/prices/${m.slug}` },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      <PricesView locale={locale} metal={m.slug} query={query} title={t("metalTitle", { metal: m.name })} subtitle={t("metalSubtitle", { metal: m.name })} />
    </>
  );
}
