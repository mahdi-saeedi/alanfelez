import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";

// Rendered per request (no API needed at build time); API responses are cached for 60s in Next's data cache.
export const dynamic = "force-dynamic";
const CACHE = { next: { revalidate: 60 } } as const;

export default async function HomePage({ params }: { params: Promise<{ locale: "fa" | "en" }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const headers = { "Accept-Language": locale };
  const [metals, markets] = await Promise.all([
    api.GET("/v1/metals", { params: { header: headers }, ...CACHE }),
    api.GET("/v1/markets", { params: { header: headers }, ...CACHE }),
  ]);

  return (
    <>
      <section className="bg-gradient-to-b from-graphite to-hero text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
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
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-2xl font-extrabold">{t("home.metalsTitle")}</h2>
        {metals.data ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {metals.data.items.map((m) => (
              <li key={m.slug} className="rounded-card border border-border bg-surface p-4 text-center font-bold">
                {m.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-down">{t("error.apiDown")}</p>
        )}

        <h2 className="mt-12 text-2xl font-extrabold">{t("home.marketsTitle")}</h2>
        <ul className="mt-6 flex flex-wrap gap-3">
          {markets.data?.items.map((m) => (
            <li key={m.slug} className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-text-2">
              {m.name}
            </li>
          ))}
        </ul>
      </section>

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
