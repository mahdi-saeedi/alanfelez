import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber, formatPriceValue, priceUnitLabel, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getArticleCategories, getArticles, getMetals, type ArticleSummary } from "@/lib/content";
import { getBasePrices, getEntitlements, type PriceRow } from "@/lib/prices";
import { Cover, KeywordChips, Meta, TopicChip, metalTone } from "@/components/content/parts";
import { LockIcon } from "@/components/Locked";
import { InsightCard } from "@/components/content/InsightCard";
import { getCommunityPosts, type CommunityPost } from "@/lib/community";
import { CommunityCard } from "@/components/community/CommunityCard";
import { PostAnalysisForm } from "@/components/community/PostAnalysisForm";
import { ChangePill } from "@/components/prices/ChangePill";

export const dynamic = "force-dynamic";

type Search = { metal?: string; category?: string; page?: string; type?: string };
/** The page's tabs (client, 2026-10-30): everything, technical analyses only, or fundamental news only. */
type View = "all" | "insights" | "news";
type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<Search> };

const PAGE_SIZE = 7; // one featured card + a grid of six
const INSIGHTS_PAGE = 8; // the analyses tab
const INSIGHTS_ALL = 4; // analyses shown first on the «همه» tab
/** How many recent articles decide which metal and category filters are offered (a filter with nothing is hidden). */
const FILTER_SCAN = 50;
/** The posting form's texts (messages analysis.community.form.*). */
const FORM_KEYS = [
  "open", "title", "titlePh", "body", "bodyPh", "metal", "noMetal", "outlook", "noOutlook", "up", "down", "neutral", "image", "imageHint",
  "submit", "sending", "cancel", "left", "none", "disclaimer", "posted", "imageFailed", "imageTooBig", "invalid", "claim", "limited", "locked", "failed",
] as const;

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
  const view: View = sp.type === "insights" || sp.type === "news" ? sp.type : "all";
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const filter = { metal: sp.metal, category: sp.category };

  // Members' analyses (client, 2026-10-30) sit with the team's, newest first. They have a metal but no category.
  const withCommunity = view !== "news" && !sp.category;
  const [news, insights, recent, top, metals, categories, base, ent, members] = await Promise.all([
    view !== "insights" ? getArticles(locale, { type: ["news"], ...filter, page: view === "news" ? page : 1, limit: PAGE_SIZE }) : null,
    view !== "news" ? getArticles(locale, { type: ["analysis", "forecast"], ...filter, page: view === "insights" ? page : 1, limit: view === "insights" ? INSIGHTS_PAGE : INSIGHTS_ALL }) : null,
    getArticles(locale, { limit: FILTER_SCAN }),
    getArticles(locale, { type: ["news"], limit: 5 }),
    getMetals(locale),
    getArticleCategories(locale),
    getBasePrices(locale),
    getEntitlements(),
    withCommunity ? getCommunityPosts(locale, { metal: sp.metal, page: view === "insights" ? page : 1, limit: view === "insights" ? INSIGHTS_PAGE : INSIGHTS_ALL }) : null,
  ]);
  if (!recent) {
    return <p className="mx-auto max-w-7xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  }
  // Offer only the metals and categories something was written about.
  const usedMetals = new Set(recent.items.map((a) => a.metal?.slug).filter(Boolean));
  const usedCats = new Set(recent.items.map((a) => a.category?.slug).filter(Boolean));
  const topics = [
    ...metals.filter((m) => usedMetals.has(m.slug) || m.slug === sp.metal).map((m) => ({ key: `m-${m.slug}`, name: m.name, query: { metal: m.slug } })),
    ...categories.filter((c) => usedCats.has(c.slug) || c.slug === sp.category).map((c) => ({ key: `c-${c.slug}`, name: c.name, query: { category: c.slug } })),
  ];
  const activeTopic = sp.metal ? `m-${sp.metal}` : sp.category ? `c-${sp.category}` : "all";
  const withView = (q: Record<string, string>) => (view === "all" ? q : { ...q, type: view });
  const newsItems = news?.items ?? [];
  const [featured, ...rest] = view === "news" && page > 1 ? [undefined, ...newsItems] : newsItems;
  const insightItems = insights?.items ?? [];
  const memberItems = members?.items ?? [];
  // One list, newest first, whoever wrote it (client, 2026-10-30).
  const feed = [
    ...insightItems.map((a) => ({ at: a.publishedAt, team: a, member: undefined as CommunityPost | undefined })),
    ...memberItems.map((p) => ({ at: p.createdAt, team: undefined, member: p })),
  ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, view === "insights" ? INSIGHTS_PAGE * 2 : INSIGHTS_ALL + 2);
  const lockedMembers = members?.locked && members.total > 0 ? members.total : 0;
  const insightPages = Math.max(Math.ceil((insights?.total ?? 0) / INSIGHTS_PAGE), Math.ceil(((members && !members.locked && members.total) || 0) / INSIGHTS_PAGE));
  const moreInsights = (insights?.total ?? 0) + (members && !members.locked ? members.total : 0) > feed.length;
  const nothing = newsItems.length === 0 && feed.length === 0 && !lockedMembers && !members?.canPost;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-10">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-text-2">{t("subtitle")}</p>
        {/* Whose responsibility a decision is (client, 2026-10-30): on the page, on every member card and the form. */}
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-6 text-text-2">{t("community.disclaimer")}</p>
      </header>

      {/* Tabs: everything / technical analyses / fundamental news (client, 2026-10-30). */}
      <nav className="mb-3 flex gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]" aria-label={t("viewLabel")}>
        {(["all", "insights", "news"] as const).map((v) => {
          const on = v === view;
          return (
            <Link
              key={v}
              href={{ pathname: "/analysis", query: { ...filter, ...(v === "all" ? {} : { type: v }) } as Record<string, string> }}
              aria-current={on ? "page" : undefined}
              className={`shrink-0 rounded-lg border px-4 py-2 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface text-text-2 hover:border-gold"}`}
            >
              {t(`views.${v}`)}
            </Link>
          );
        })}
      </nav>

      {/* Metals and categories: one sideways-scrolling line on phones, wrapped from sm up. */}
      {topics.length > 0 && (
        <nav className="-mx-4 mb-6 flex gap-2 overflow-x-auto whitespace-nowrap px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" aria-label={t("topicLabel")}>
          {[{ key: "all", name: t("all"), query: {} as Record<string, string> }, ...topics].map((tab) => {
            const on = tab.key === activeTopic;
            return (
              <Link
                key={tab.key}
                href={{ pathname: "/analysis", query: withView(tab.query) }}
                aria-current={on ? "page" : undefined}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${on ? "border-gold bg-gold/15 font-bold text-gold-dark" : "border-border bg-surface text-text-2 hover:border-gold"}`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-8">
          {nothing && <p className="rounded-card border border-border bg-surface p-8 text-center text-text-2">{t("empty")}</p>}

          {/* Technical analyses first: they're what the page is named for (client, 2026-10-30). The team's and members'
              in one list, newest first; the byline's color tells them apart. */}
          {view !== "news" && (feed.length > 0 || lockedMembers > 0 || members?.canPost) && (
            <section>
              <h2 className="mb-1 text-xl font-extrabold">{t("insights")}</h2>
              <p className="mb-4 text-sm text-text-2">{t("insightsSub")}</p>
              {members?.canPost && (
                <div className="mb-4">
                  <PostAnalysisForm
                    metals={metals.map((m) => ({ slug: m.slug, name: m.name }))}
                    left={members.postsLeftToday ?? 0}
                    labels={Object.fromEntries(FORM_KEYS.map((k) => [k, k === "left" ? t("community.form.left", { n: "{n}" }) : t(`community.form.${k}`)])) as Record<(typeof FORM_KEYS)[number], string>}
                  />
                </div>
              )}
              {lockedMembers > 0 && (
                <Link href="/plans" className="mb-4 flex items-center gap-3 rounded-card border border-info/30 bg-info-bg/50 p-4 text-sm hover:border-info">
                  <LockIcon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{t("community.lockedCount", { n: formatNumber(lockedMembers, locale) })}</span>
                  <span className="shrink-0 font-bold text-info">{t("community.lockedCta")}</span>
                </Link>
              )}
              <div className="grid items-start gap-4 sm:grid-cols-2">
                {feed.map((f) =>
                  f.team ? <InsightCard key={f.team.slug} a={f.team} locale={locale} /> : f.member && <CommunityCard key={f.member.id} p={f.member} locale={locale} />,
                )}
              </div>
              {view === "all" && moreInsights && (
                <Link href={{ pathname: "/analysis", query: { ...withView(filter as Record<string, string>), type: "insights" } }} className="mt-2 inline-flex min-h-10 items-center text-sm font-bold text-gold-dark hover:underline">
                  {t("allInsights")}
                </Link>
              )}
              {view === "insights" && insightPages > 1 && (
                <Pager page={page} pages={insightPages} query={{ ...filter, type: "insights" }} locale={locale} />
              )}
            </section>
          )}
          {view === "insights" && feed.length === 0 && !lockedMembers && !nothing && <p className="text-sm text-text-2">{t("emptyInsights")}</p>}

          {newsItems.length > 0 && (
            <section className="space-y-4">
              {view === "all" && <h2 className="text-xl font-extrabold">{t("newsTitle")}</h2>}
              {featured && <FeaturedCard a={featured} locale={locale} />}
              <div className="grid gap-4 sm:grid-cols-2">
                {rest.map((a) => a && <NewsCard key={a.slug} a={a} locale={locale} />)}
              </div>
              {news && news.total > PAGE_SIZE && (view === "news" ? (
                <Pager page={page} pages={Math.ceil(news.total / PAGE_SIZE)} query={{ ...filter, type: "news" }} locale={locale} />
              ) : (
                <Link href={{ pathname: "/analysis", query: { ...(filter as Record<string, string>), type: "news" } }} className="inline-flex min-h-10 items-center text-sm font-bold text-gold-dark hover:underline">
                  {t("allNews")}
                </Link>
              ))}
            </section>
          )}
          {view !== "insights" && newsItems.length === 0 && !nothing && <p className="text-sm text-text-2">{t("emptyNews")}</p>}
        </div>

        {/* On phones this comes after the articles; «اخبار مهم امروز» repeats the list above, so it's desktop only. */}
        <aside className="space-y-4">
          {top && top.items.length > 0 && (
            <section className="hidden rounded-card border border-border bg-surface p-4 shadow-soft lg:block">
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
          {base && base.items.length > 0 && <Indicators rows={base.items} locale={locale} free={(ent?.tier ?? "free") === "free"} />}
        </aside>
      </div>
    </div>
  );
}

/**
 * The market's main prices, each with its own market and unit: a world price is $/ton, a domestic one Toman/kg, so one
 * unit line for the box would misread one of them. Free users see the names only (client, 2026-10-30): the numbers
 * aren't rendered for them, and the box points to the plans.
 */
async function Indicators({ rows, locale, free }: { rows: PriceRow[]; locale: Locale; free: boolean }) {
  const t = await getTranslations();
  const latest = rows.map((r) => r.observedAt).filter(Boolean).sort().at(-1);
  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
      <h2 className="mb-3 text-sm font-bold">{t("analysis.indicators")}</h2>
      <ul className="space-y-2.5 text-sm">
        {rows.map((r) => (
          <li key={r.series.slug} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate">{r.series.metal.name}</span>
              <span className="block truncate text-[11px] text-text-3">
                {r.series.market.name} · <span dir="ltr">{priceUnitLabel(r.series, locale)}</span>
              </span>
            </span>
            {free ? (
              <LockIcon className="h-4 w-4 shrink-0" />
            ) : (
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-bold tabular-nums">{r.series.currency === "USD" && "$"}{r.price ? formatPriceValue(r.price, locale) : "—"}</span>
                <ChangePill bp={r.change?.bp} locale={locale} size="sm" />
              </span>
            )}
          </li>
        ))}
      </ul>
      {free ? (
        <Link href="/plans" className="mt-4 block rounded-lg bg-gold px-3 py-2 text-center text-sm font-bold text-graphite hover:bg-gold-light">
          {t("analysis.indicatorsLocked", { plan: t("lock.plan.silver") })}
        </Link>
      ) : (
        <>
          {latest && <p className="mt-3 text-xs text-text-3">{t("prices.lastUpdate", { time: formatDate(latest, locale, true) })}</p>}
          <Link href="/prices" className="mt-2 inline-flex min-h-8 items-center text-xs font-bold text-gold-dark hover:underline">{t("nav.prices")}</Link>
        </>
      )}
    </section>
  );
}

async function FeaturedCard({ a, locale }: { a: ArticleSummary; locale: Locale }) {
  return (
    <Link href={`/analysis/${a.slug}`} className="group block overflow-hidden rounded-card border border-border bg-surface shadow-soft">
      {/* A cover only when there's a picture: an empty dark panel only pushed the text down (client, 2026-10-30). */}
      {a.coverUrl ? (
        <div className="relative">
          <Cover a={a} className="h-44 sm:h-56" />
          <span className="absolute start-4 bottom-4"><TopicChip a={a} /></span>
        </div>
      ) : (
        <div className="h-1.5" style={{ background: metalTone(a.metal?.slug) }} aria-hidden />
      )}
      <div className="space-y-2 p-5">
        {!a.coverUrl && <TopicChip a={a} />}
        <h2 className="text-lg font-extrabold group-hover:text-gold-dark sm:text-xl">{a.title}</h2>
        {a.locked ? (
          <>
            <KeywordChips a={a} />
            <LockedNote plan={a.requiredPlan} />
          </>
        ) : (
          <p className="line-clamp-2 text-sm text-text-2">{a.summary}</p>
        )}
        <Meta a={a.locked ? { ...a, outlook: undefined } : a} locale={locale} />
      </div>
    </Link>
  );
}

async function NewsCard({ a, locale }: { a: ArticleSummary; locale: Locale }) {
  return (
    <Link href={`/analysis/${a.slug}`} className="group flex flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-soft hover:border-gold/60">
      <TopicChip a={a} />
      <h3 className="font-bold leading-7 group-hover:text-gold-dark">{a.title}</h3>
      {a.locked ? (
        <div className="flex flex-1 flex-col gap-2">
          <KeywordChips a={a} />
          <LockedNote plan={a.requiredPlan} />
        </div>
      ) : (
        <p className="line-clamp-2 flex-1 text-sm text-text-2">{a.summary}</p>
      )}
      <Meta a={a.locked ? { ...a, outlook: undefined } : a} locale={locale} />
    </Link>
  );
}


/** On a locked news card instead of the summary (client, 2026-10-30): titles are free, the text is for subscribers. */
async function LockedNote({ plan }: { plan?: string }) {
  const t = await getTranslations();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-dark">
      <LockIcon className="h-4 w-4" />
      {plan === "gold" ? t("analysis.lockedNews", { plan: t("lock.plan.gold") }) : t("analysis.lockedNewsSilver")}
    </span>
  );
}

async function Pager({ page, pages, query, locale }: { page: number; pages: number; query: { metal?: string; category?: string; type?: string }; locale: Locale }) {
  const t = await getTranslations("analysis");
  const q = (p: number) => ({ pathname: "/analysis" as const, query: Object.fromEntries(Object.entries({ ...query, page: p > 1 ? String(p) : undefined }).filter((e): e is [string, string] => !!e[1])) });
  return (
    <nav className="flex items-center justify-between gap-4 pt-2 text-sm" aria-label="pagination">
      {page > 1 ? <Link href={q(page - 1)} className="rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-gold">{t("prev")}</Link> : <span />}
      <span className="text-text-3">{t("page", { page: formatNumber(page, locale), pages: formatNumber(pages, locale) })}</span>
      {page < pages ? <Link href={q(page + 1)} className="rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-gold">{t("next")}</Link> : <span />}
    </nav>
  );
}
