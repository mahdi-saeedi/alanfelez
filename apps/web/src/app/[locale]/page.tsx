import { getTranslations, setRequestLocale } from "next-intl/server";
import { displayAmount, formatBp, formatDate, formatPriceValue, priceUnitLabel } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getBasePrices, getHistory } from "@/lib/prices";
import { PriceCard } from "@/components/prices/PriceCard";
import { HeroCarousel, type HeroItem } from "@/components/prices/HeroCarousel";
import { GlobalChartCarousel, type GlobalChartItem } from "@/components/prices/GlobalChartCarousel";
import { LiveDot } from "@/components/prices/LiveDot";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/site";

// Rendered per request (no API needed at build time); anonymous API responses are cached briefly in Next's data cache.
export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: "fa" | "en" }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const prices = await getBasePrices(locale);
  const base = (prices?.items ?? []).filter((r) => r.series.isBase);
  const domestic = base.filter((r) => r.series.market.scope !== "global");
  // The live prices block shows global (LME) prices only (client, 2026-10-25); the domestic ones until any exist.
  const global = base.filter((r) => r.series.market.scope === "global");
  const live = global.length ? global : base;
  // Hero card: the global prices' 1-month charts in turn (client, 2026-10-25); the domestic ones while none exist.
  const heroRows = (global.length ? global : domestic).filter((r) => r.price);
  const heroItems: HeroItem[] = await Promise.all(
    heroRows.map(async (r) => {
      const h = await getHistory(locale, r.series.slug, "1M");
      const points = "data" in h && h.data ? h.data.points.map((p) => Number(p.amount)) : [];
      const bp = points.length > 1 ? Math.trunc(((points.at(-1)! - points[0]!) * 10_000) / points[0]!) : undefined;
      return {
        slug: r.series.slug,
        name: r.series.metal.name,
        price: formatPriceValue(r.price!, locale),
        unit: priceUnitLabel(r.series, locale),
        change: bp !== undefined ? formatBp(bp, locale) : undefined,
        up: (bp ?? 0) >= 0,
        dayChange: r.change ? formatBp(r.change.bp, locale) : undefined,
        dayUp: (r.change?.bp ?? 0) >= 0,
        points,
      };
    }),
  );

  // Global prices chart section (client, 2026-10-26): 1-month history of each global price, in dollars per ton.
  const chartItems: GlobalChartItem[] = (
    await Promise.all(
      global.filter((r) => r.price).map(async (r) => {
        const h = await getHistory(locale, r.series.slug, "1M");
        const pts = "data" in h && h.data ? h.data.points : [];
        const points = pts.map((p) => ({ t: p.t, v: Number(displayAmount({ amount: p.amount, currency: r.series.currency, unit: r.series.unit })) }));
        const first = points[0]?.v ?? 0;
        const bp = points.length > 1 && first ? Math.trunc(((points.at(-1)!.v - first) * 10_000) / first) : undefined;
        return {
          slug: r.series.slug,
          metal: r.series.metal.slug,
          name: r.series.metal.name,
          price: formatPriceValue(r.price!, locale),
          unit: priceUnitLabel(r.series, locale),
          change: bp !== undefined ? formatBp(bp, locale) : undefined,
          up: (bp ?? 0) >= 0,
          source: r.source ?? r.series.market.name,
          updated: r.observedAt ? formatDate(r.observedAt, locale, true) : "—",
          points,
        };
      }),
    )
  ).filter((it) => it.points.length > 1);

  const home = `${SITE_URL}${locale === "en" ? "/en" : "/"}`;
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: t("brand.name"), url: SITE_URL, logo: `${SITE_URL}/logo.png` },
            { "@type": "WebSite", "@id": `${SITE_URL}/#site`, name: t("brand.name"), url: home, inLanguage: locale, publisher: { "@id": `${SITE_URL}/#org` } },
          ],
        }}
      />
      <section className="bg-gradient-to-b from-graphite to-hero text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2">
          <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-graphite-3 px-3 py-1 text-sm text-silver-light">
            <span className="h-2 w-2 animate-pulse rounded-full bg-up" aria-hidden />
            {t("home.badge")}
          </span>
          <h1 className="mt-6 max-w-3xl font-extrabold leading-tight">
            <span className="block text-5xl text-gold sm:text-7xl">{t("brand.name")}</span>
            <span className="mt-3 block text-2xl sm:text-5xl">{t("home.titleTagline")}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-silver-light">{t("home.subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/prices" className="rounded-lg bg-gold px-6 py-3 font-bold text-graphite hover:bg-gold-light">
              {t("home.ctaPrices")}
            </Link>
            <Link href="/chart" className="rounded-lg border border-graphite-3 px-6 py-3 font-bold text-white hover:border-gold">
              {t("home.ctaChart")}
            </Link>
          </div>
          </div>
          {heroItems.length > 0 && <HeroCarousel items={heroItems} changeLabel={t("home.heroChange")} showLabel={t("home.heroShow")} />}
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-3 text-2xl font-extrabold">
              {t("home.liveTitle")} <LiveDot />
            </h2>
            <Link href="/prices" className="text-sm font-bold text-gold-dark hover:text-gold">{t("home.seeAll")}</Link>
          </div>
          {live.length ? (
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {live.map((r) => (
                <li key={r.series.slug}><PriceCard row={r} /></li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-down">{t("error.apiDown")}</p>
          )}
          <p className="mt-4 text-xs text-text-3">{t("prices.info")}</p>
        </div>
      </section>

      {chartItems.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-12">
          <h2 className="text-2xl font-extrabold">{t("home.globalChartTitle")}</h2>
          <p className="mt-2 mb-5 text-sm text-text-2">{t("home.globalChartSubtitle")}</p>
          <GlobalChartCarousel
            items={chartItems}
            locale={locale}
            labels={{ change: t("home.heroChange"), source: t.raw("chart.source") as string, full: t("home.globalChartFull") }}
          />
        </section>
      )}

      <div className="h-12" />
      <section className="mx-auto max-w-7xl px-4">
        <div className="rounded-card bg-graphite p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-extrabold sm:text-3xl">{t("home.plansTitle")}</h2>
          <Link href="/plans" className="mt-6 inline-block rounded-lg bg-gold px-6 py-3 font-bold text-graphite hover:bg-gold-light">
            {t("home.plansCta")}
          </Link>
        </div>
      </section>
    </>
  );
}
