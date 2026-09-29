import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatBp, formatPriceValue, priceUnitLabel } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getBasePrices, getHistory } from "@/lib/prices";
import { PriceCard } from "@/components/prices/PriceCard";
import { Sparkline } from "@/components/prices/Sparkline";
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
  const hero = base.find((r) => r.series.metal.slug === "copper") ?? base[0];
  const heroHistory = hero ? await getHistory(locale, hero.series.slug, "1M") : null;
  const heroPoints = heroHistory && "data" in heroHistory && heroHistory.data ? heroHistory.data.points.map((p) => Number(p.amount)) : [];
  const heroChange = heroPoints.length > 1 ? Math.trunc(((heroPoints.at(-1)! - heroPoints[0]!) * 10_000) / heroPoints[0]!) : undefined;

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
          <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
            {t("home.titleStart")} <span className="text-gold">{t("home.titleHighlight")}</span> {t("home.titleEnd")}
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
          {hero?.price && (
            <Link href={{ pathname: "/chart", query: { series: hero.series.slug } }} className="block rounded-card border border-graphite-3 bg-graphite-2/60 p-6 hover:border-gold">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-bold">
                  {hero.series.metal.name} — {formatPriceValue(hero.price, locale)}{" "}
                  <span className="text-sm font-normal text-silver-light" dir="ltr">{priceUnitLabel(hero.series, locale)}</span>
                </span>
                <span className="text-xs text-silver-light">
                  {t("home.heroChange")} {heroChange !== undefined && <span className={heroChange >= 0 ? "text-up" : "text-down"} dir="ltr">{formatBp(heroChange, locale)}</span>}
                </span>
              </div>
              <Sparkline values={heroPoints} className="mt-4 h-32 w-full" />
              <ul className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                {base.slice(0, 4).map((r) => (
                  <li key={r.series.slug}>
                    <div className="text-silver-light">{r.series.metal.name}</div>
                    <div className={(r.change?.bp ?? 0) >= 0 ? "text-up" : "text-down"} dir="ltr">{r.change ? formatBp(r.change.bp, locale) : "—"}</div>
                  </li>
                ))}
              </ul>
            </Link>
          )}
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
          {base.length ? (
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {base.map((r) => (
                <li key={r.series.slug}><PriceCard row={r} /></li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-down">{t("error.apiDown")}</p>
          )}
          <p className="mt-4 text-xs text-text-3">{t("prices.info")}</p>
        </div>
      </section>

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
