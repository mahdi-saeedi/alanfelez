import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber, formatPriceValue, priceUnitLabel, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getArticleCategories, getArticles, getMetals, type ArticleSummary } from "@/lib/content";
import { getBasePrices, type PriceRow } from "@/lib/prices";
import { Cover, Meta, TopicChip } from "@/components/content/parts";
import { LockIcon, TierBadge } from "@/components/Locked";
import { ChangePill } from "@/components/prices/ChangePill";

export const dynamic = "force-dynamic";

type Search = { metal?: string; category?: string; page?: string };
type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<Search> };

const PAGE_SIZE = 7; // one featured card + a grid of six

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "analysis" });
  return seo(locale, "/analysis", { title: t("title"), description: t("subtitle") });
}

/**
 * News & analysis (SCOPE §5 #4, design 09). News is public; analyses and forecasts are Gold, listed as teasers
 * (the API never sends a locked body). Filters are links, so the page works without JavaScript.
 */
export default async function AnalysisPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("analysis");
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const filter = { metal: sp.metal, category: sp.category };

  const [news, insights, top, metals, categories, base] = await Promise.all([
    getArticles(locale, { type: ["news"], ...filter, page, limit: PAGE_SIZE }),
    getArticles(locale, { type: ["analysis", "forecast"], ...filter, limit: 4 }),
    getArticles(locale, { type: ["news"], limit: 5 }),
    getMetals(locale),
    getArticleCategories(locale),
    getBasePrices(locale),
  ]);
  if (!news) {
    return <p className="mx-auto max-w-7xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  }
  const [featured, ...rest] = page === 1 ? news.items : [undefined, ...news.items];
  const pages = Math.max(1, Math.ceil(news.total / PAGE_SIZE));
  const tabs = [
    { key: "all", name: t("all"), query: {} },
    ...metals.map((m) => ({ key: `m-${m.slug}`, name: m.name, query: { metal: m.slug } })),
    ...categories.map((c) => ({ key: `c-${c.slug}`, name: c.name, query: { category: c.slug } })),
  ];
  const activeKey = sp.metal ? `m-${sp.metal}` : sp.category ? `c-${sp.category}` : "all";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-text-2">{t("subtitle")}</p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label={t("title")}>
        {tabs.map((tab) => {
          const on = tab.key === activeKey;
          return (
            <Link
              key={tab.key}
              href={{ pathname: "/analysis", query: tab.query }}
              aria-current={on ? "page" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface text-text-2 hover:border-gold"}`}
            >
              {tab.name}
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          {!featured && rest.length === 0 && <p className="rounded-card border border-border bg-surface p-8 text-center text-text-2">{t("empty")}</p>}
          {featured && <FeaturedCard a={featured} locale={locale} />}
          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((a) => a && <NewsCard key={a.slug} a={a} locale={locale} />)}
          </div>
          {pages > 1 && <Pager page={page} pages={pages} query={filter} locale={locale} />}
        </div>

        <aside className="space-y-4">
          {top && top.items.length > 0 && (
            <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
              <h2 className="mb-3 text-sm font-bold">{t("topNews")}</h2>
              <ol className="space-y-2.5 text-sm">
                {top.items.map((a, i) => (
                  <li key={a.slug} className="flex gap-2 border-b border-border pb-2.5 last:border-0 last:pb-0">
                    <span className="text-text-3 tabular-nums">{formatNumber(i + 1, locale)}.</span>
                    <Link href={`/analysis/${a.slug}`} className="line-clamp-2 hover:text-gold-dark">{a.title}</Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {base && base.items.length > 0 && <Indicators rows={base.items} locale={locale} />}
        </aside>
      </div>

      {insights && insights.items.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-extrabold">{t("insights")}</h2>
            <TierBadge plan="gold" label={(await getTranslations("lock"))("plan.gold")} />
          </div>
          <p className="mb-4 text-sm text-text-2">{t("insightsSub")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {insights.items.map((a) => (
              <InsightCard key={a.slug} a={a} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Base prices (free for everyone, so showing them here never counts as paid use), with source and time. */
async function Indicators({ rows, locale }: { rows: PriceRow[]; locale: Locale }) {
  const t = await getTranslations();
  const latest = rows.map((r) => r.observedAt).filter(Boolean).sort().at(-1);
  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
      <h2 className="mb-3 text-sm font-bold">{t("analysis.indicators")}</h2>
      <ul className="space-y-2.5 text-sm">
        {rows.map((r) => (
          <li key={r.series.slug} className="flex items-center justify-between gap-2" title={r.source ? t("analysis.source", { source: r.source }) : undefined}>
            <span className="truncate">{r.series.metal.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-bold tabular-nums">{r.price ? formatPriceValue(r.price, locale) : "—"}</span>
              <ChangePill bp={r.change?.bp} locale={locale} size="sm" />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-3">
        {rows[0] && priceUnitLabel(rows[0].series, locale)}
        {latest && <> · {t("prices.lastUpdate", { time: formatDate(latest, locale, true) })}</>}
      </p>
      <Link href="/prices" className="mt-2 block text-xs font-bold text-gold-dark hover:underline">{t("nav.prices")}</Link>
    </section>
  );
}

async function FeaturedCard({ a, locale }: { a: ArticleSummary; locale: Locale }) {
  return (
    <Link href={`/analysis/${a.slug}`} className="group block overflow-hidden rounded-card border border-border bg-surface shadow-soft">
      <div className="relative">
        <Cover a={a} className="h-44 sm:h-56" />
        <span className="absolute start-4 bottom-4"><TopicChip a={a} /></span>
      </div>
      <div className="space-y-2 p-5">
        <h2 className="text-lg font-extrabold group-hover:text-gold-dark sm:text-xl">{a.title}</h2>
        <p className="line-clamp-2 text-sm text-text-2">{a.summary}</p>
        <Meta a={a} locale={locale} />
      </div>
    </Link>
  );
}

async function NewsCard({ a, locale }: { a: ArticleSummary; locale: Locale }) {
  return (
    <Link href={`/analysis/${a.slug}`} className="group flex flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-soft hover:border-gold/60">
      <TopicChip a={a} />
      <h3 className="font-bold leading-7 group-hover:text-gold-dark">{a.title}</h3>
      <p className="line-clamp-2 flex-1 text-sm text-text-2">{a.summary}</p>
      <Meta a={a} locale={locale} />
    </Link>
  );
}

/** Gold analysis / forecast teaser. Locked: title + summary only, with the upgrade CTA (no body exists here). */
async function InsightCard({ a, locale }: { a: ArticleSummary; locale: Locale }) {
  const t = await getTranslations("analysis");
  return (
    <article className={`flex flex-col gap-2 rounded-card border bg-surface p-4 shadow-soft ${a.locked ? "border-gold/60" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-bold text-gold-dark">{t(`type.${a.type}`)}</span>
        {a.locked && <LockIcon className="h-5 w-5" />}
      </div>
      <h3 className="font-bold leading-7">{a.title}</h3>
      <p className="line-clamp-2 flex-1 text-sm text-text-2">{a.summary}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Meta a={a} locale={locale} />
        {a.locked ? (
          <Link href="/plans" className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-graphite hover:bg-gold-light">{t("readToUnlock")}</Link>
        ) : (
          <Link href={`/analysis/${a.slug}`} className="rounded-lg bg-graphite px-3 py-1.5 text-xs font-bold text-white hover:bg-graphite-2">{t("read")}</Link>
        )}
      </div>
    </article>
  );
}

async function Pager({ page, pages, query, locale }: { page: number; pages: number; query: { metal?: string; category?: string }; locale: Locale }) {
  const t = await getTranslations("analysis");
  const q = (p: number) => ({ pathname: "/analysis" as const, query: Object.fromEntries(Object.entries({ ...query, page: p > 1 ? String(p) : undefined }).filter((e): e is [string, string] => !!e[1])) });
  return (
    <nav className="flex items-center justify-between gap-4 pt-2 text-sm" aria-label="pagination">
      {page > 1 ? <Link href={q(page - 1)} className="rounded-lg border border-border bg-surface px-4 py-2 hover:border-gold">{t("prev")}</Link> : <span />}
      <span className="text-text-3">{t("page", { page: formatNumber(page, locale), pages: formatNumber(pages, locale) })}</span>
      {page < pages ? <Link href={q(page + 1)} className="rounded-lg border border-border bg-surface px-4 py-2 hover:border-gold">{t("next")}</Link> : <span />}
    </nav>
  );
}
