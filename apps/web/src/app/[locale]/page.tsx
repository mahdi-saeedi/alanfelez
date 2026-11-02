import { getTranslations, setRequestLocale } from "next-intl/server";
import { MetalIcon } from "@/components/prices/MetalIcon";
import { displayAmount, formatBp, formatDate, formatPriceValue, priceUnitLabel } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getBasePrices, getHistory } from "@/lib/prices";
import { PriceCard } from "@/components/prices/PriceCard";
import { HeroCarousel, type HeroItem } from "@/components/prices/HeroCarousel";
import { GlobalChartCarousel, type GlobalChartItem } from "@/components/prices/GlobalChartCarousel";
import { LiveDot } from "@/components/prices/LiveDot";
import { JsonLd } from "@/components/JsonLd";
import { PlanCards } from "@/components/PlanCards";
import { WhyAlanFelez } from "@/components/WhyAlanFelez";
import { SilverUpgrade } from "@/components/SilverUpgrade";
import { LatestAuctions } from "@/components/auctions/LatestAuctions";
import { LatestInsights } from "@/components/content/LatestInsights";
import { getMetals } from "@/lib/content";
import { FinalCta } from "@/components/FinalCta";
import { api } from "@/lib/api";
import { getMe } from "@/lib/account";
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
  // Hero card: the world prices' 1-month charts in turn (client, 2026-10-25), the domestic ones while none exist; all
  // seven metals in the tabs (2026-11-02), a metal without a price yet marked «به‌زودی».
  const heroRows = (global.length ? global : domestic).filter((r) => r.price);
  const heroMetals = await getMetals(locale);
  const heroItems: HeroItem[] = await Promise.all(
    heroOrder(heroMetals.length ? heroMetals : uniqueMetals(heroRows)).map(async (m) => {
      const r = heroRows.find((x) => x.series.metal.slug === m.slug);
      if (!r) return { metal: m.slug, name: m.name };
      const h = await getHistory(locale, r.series.slug, "1M");
      const points = "data" in h && h.data ? h.data.points.map((p) => Number(p.amount)) : [];
      const bp = points.length > 1 ? Math.trunc(((points.at(-1)! - points[0]!) * 10_000) / points[0]!) : undefined;
      return {
        metal: m.slug,
        name: m.name,
        chart: {
          slug: r.series.slug,
          price: formatPriceValue(r.price!, locale),
          unit: priceUnitLabel(r.series, locale),
          change: bp !== undefined ? formatBp(bp, locale) : undefined,
          up: (bp ?? 0) >= 0,
          dayChange: r.change ? formatBp(r.change.bp, locale) : undefined,
          dayUp: (r.change?.bp ?? 0) >= 0,
          points,
        },
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

  // Plans section after the global chart (client, 2026-10-26): the same cards as /plans.
  const [plansRes, me, metals] = await Promise.all([
    api.GET("/v1/plans", { params: { header: { "Accept-Language": locale } }, next: { revalidate: 60 } }),
    getMe(),
    getMetals(locale), // links to each metal's price page under the live prices (search engines follow them)
  ]);
  const plans = plansRes.data;

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
          {heroItems.some((it) => it.chart) && <HeroCarousel items={heroItems} changeLabel={t("home.heroChange")} showLabel={t("home.heroShow")} soonLabel={t("home.heroSoon")} />}
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
              {/* All seven metals (client, 2026-11-02); a metal without a world price yet gets a «به‌زودی» card. */}
              {(heroMetals.length ? heroMetals : uniqueMetals(live)).map((m) => {
                const r = live.find((x) => x.series.metal.slug === m.slug && x.price);
                return (
                  <li key={m.slug}>
                    {r ? (
                      <PriceCard row={r} />
                    ) : (
                      <div className="flex h-full flex-col rounded-card border border-dashed border-border bg-surface-2 p-4">
                        <div className="flex items-center gap-2 text-sm text-text-2"><MetalIcon slug={m.slug} className="h-10 w-10 opacity-60" />{m.name}</div>
                        <div className="mt-2 text-xl font-extrabold text-text-3">—</div>
                        <div className="mt-auto pt-3 text-xs text-text-3">{t("home.globalSoon")}</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-6 text-down">{t("error.apiDown")}</p>
          )}
          <p className="mt-4 text-xs text-text-3">{t("prices.info")}</p>
          {metals.length > 0 && (
            <nav aria-label={t("home.metalPages")} className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm text-text-2">
              {metals.map((m, i) => (
                <span key={m.slug} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden className="text-text-3">·</span>}
                  <Link href={`/prices/${m.slug}`} className="hover:text-gold-dark hover:underline">{t("prices.metalTitle", { metal: m.name })}</Link>
                </span>
              ))}
            </nav>
          )}
        </div>
      </section>

      {chartItems.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-12">
          <h2 className="text-2xl font-extrabold">{t("home.globalChartTitle")}</h2>
          <p className="mt-2 mb-5 text-sm text-text-2">{t("home.globalChartSubtitle")}</p>
          <GlobalChartCarousel
            items={chartItems}
            metals={(heroMetals.length ? heroMetals : uniqueMetals(heroRows)).map((m) => ({ slug: m.slug, name: m.name }))}
            soonLabel={t("home.heroSoon")}
            locale={locale}
            labels={{ change: t("home.heroChange"), source: t.raw("chart.source") as string, full: t("home.globalChartFull") }}
          />
        </section>
      )}

      {/* Plans by who is looking (client, 2026-11-02): visitors and free members see the three cards, Silver members what
          Gold adds, Gold members nothing. An ended subscription makes the account free again, so the cards come back. */}
      {plans && me?.tier !== "gold" && (
        <section className="mt-12 bg-surface py-12">
          <div className="mx-auto max-w-6xl px-4">
            {me?.tier === "silver" ? (
              <>
                <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t("home.upgrade.sectionTitle")}</h2>
                <SilverUpgrade plans={plans.items} endsAt={me.current?.endsAt} purchasable={plans.purchasable} locale={locale} />
              </>
            ) : (
              <>
                <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t("home.plansTitle")}</h2>
                <p className="mt-2 text-center text-text-2">{t("plans.subtitle")}</p>
                <PlanCards plans={plans} me={me} period="month" locale={locale} />
                <p className="mt-6 text-center text-sm">
                  <Link href="/plans" className="font-bold text-gold-dark hover:text-gold">{t("home.plansCta")}</Link>
                  <span className="ms-2 text-text-3">{t("home.plansPeriods")}</span>
                </p>
              </>
            )}
          </div>
        </section>
      )}

      <WhyAlanFelez locale={locale} signedIn={!!me} />
      <LatestAuctions locale={locale} />
      <LatestInsights locale={locale} />
      <FinalCta locale={locale} signedIn={!!me} />
    </>
  );
}

/** The metals of some price rows, once each, in order (when the metal list isn't available). */
function uniqueMetals(rows: { series: { metal: { slug: string; name: string } } }[]) {
  return [...new Map(rows.map((r) => [r.series.metal.slug, r.series.metal])).values()];
}

// The hero card's order (client, 2026-11-02): a grey metal, then a coloured one, so every switch is plain to see.
const HERO_ORDER = ["aluminum", "copper", "zinc", "brass", "lead", "cast-iron", "iron"];
function heroOrder<T extends { slug: string }>(metals: T[]): T[] {
  const rank = (slug: string) => (HERO_ORDER.includes(slug) ? HERO_ORDER.indexOf(slug) : HERO_ORDER.length);
  return [...metals].sort((a, b) => rank(a.slug) - rank(b.slug));
}
