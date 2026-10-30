import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/site";
import { getArticle, getArticles } from "@/lib/content";
import { Cover, Meta, RichText, TopicChip } from "@/components/content/parts";
import { Locked } from "@/components/Locked";
import { InsightCard } from "@/components/content/InsightCard";
import { ShareButtons } from "@/components/content/ShareButtons";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  const a = await getArticle(locale, slug);
  if (!a) return {};
  const base = await seo(locale, `/analysis/${slug}`, { title: a.title, description: a.summary, type: "article" });
  return { ...base, openGraph: { ...base.openGraph, type: "article", publishedTime: a.publishedAt, ...(a.coverUrl ? { images: [a.coverUrl] } : {}) } };
}

/** One article. A locked analysis / forecast shows its teaser and the upgrade box: the API sent no body. */
export default async function ArticlePage({ params }: Params) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const a = await getArticle(locale, slug);
  if (a === null) notFound();
  if (!a) return <p className="mx-auto max-w-3xl px-4 py-16 text-down">{t("error.apiDown")}</p>;
  const plan = a.requiredPlan ?? "gold";
  const insight = a.type !== "news";
  // More on the same metal (or category) at the end, so a reader (or a locked one) has somewhere to go next.
  const related = ((await getArticles(locale, { ...(a.metal ? { metal: a.metal.slug } : a.category ? { category: a.category.slug } : {}), limit: 4 }))?.items ?? [])
    .filter((r) => r.slug !== a.slug)
    .slice(0, 3);
  const url = `${SITE_URL}${locale === "en" ? "/en" : ""}/analysis/${a.slug}`;

  // Structured data only for what the page really shows (a locked body isn't there, so no articleBody).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": a.type === "news" ? "NewsArticle" : "Article",
    headline: a.title,
    description: a.summary,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    inLanguage: locale,
    ...(a.author ? { author: { "@type": "Person", name: a.author } } : {}),
    ...(a.coverUrl ? { image: [a.coverUrl] } : {}),
    isAccessibleForFree: !a.locked,
  };

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={jsonLd} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t("nav.home"), item: `${SITE_URL}${locale === "en" ? "/en" : "/"}` },
            { "@type": "ListItem", position: 2, name: t("nav.analysis"), item: `${SITE_URL}${locale === "en" ? "/en" : ""}/analysis` },
            { "@type": "ListItem", position: 3, name: a.title },
          ],
        }}
      />
      <Link href="/analysis" className="inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-bold text-text-2 hover:text-gold-dark">{t("analysis.back")}</Link>

      <header className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${insight ? "bg-gold/15 text-gold-dark" : "bg-surface-2 text-text-2"}`}>{t(`analysis.type.${a.type}`)}</span>
          <TopicChip a={a} />
        </div>
        <h1 className="text-2xl font-extrabold leading-10 sm:text-3xl">{a.title}</h1>
        {!a.locked && <p className="text-text-2">{a.summary}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-3">
          {insight ? <span className="font-bold text-gold-dark">{t("analysis.byTeam")}</span> : a.author && <span>{t("analysis.by", { name: a.author })}</span>}
          <Meta a={a.locked ? { ...a, outlook: undefined } : a} locale={locale} />
        </div>
      </header>

      {a.coverUrl && <Cover a={a} className="mt-6 h-48 rounded-card sm:h-72" />}

      <div className="mt-8">
        {a.body ? (
          <RichText html={a.body} />
        ) : (
          <Locked plan={plan} title={t("analysis.lockedTitle", { plan: t(`lock.plan.${plan}`) })}>
            {t(insight ? "analysis.lockedBody" : "analysis.lockedBodyNews", { plan: t(`lock.plan.${plan}`) })}
          </Locked>
        )}
      </div>

      {insight && <p className="mt-8 rounded-card border border-border bg-surface-2 p-4 text-xs leading-6 text-text-2">{t("analysis.disclaimer")}</p>}
      {Date.parse(a.updatedAt) - Date.parse(a.publishedAt) > 3_600_000 && ( // edited after publishing
        <p className="mt-4 text-xs text-text-3">{t("pages.updated", { date: formatDate(a.updatedAt, locale) })}</p>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <ShareButtons url={url} title={a.title} labels={{ share: t("analysis.share"), copy: t("analysis.copyLink"), copied: t("analysis.copied"), more: t("analysis.shareMore") }} />
      </div>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-extrabold">{t("analysis.related", { topic: (a.metal ?? a.category)?.name ?? "" })}</h2>
          <ul className="grid gap-3">
            {related.map((r) =>
              r.type === "news" ? (
                <li key={r.slug}>
                  <Link href={`/analysis/${r.slug}`} className="block rounded-card border border-border bg-surface p-4 shadow-soft hover:border-gold/60">
                    <span className="font-bold leading-7">{r.title}</span>
                    {!r.locked && <span className="mt-1 line-clamp-2 block text-sm text-text-2">{r.summary}</span>}
                  </Link>
                </li>
              ) : (
                <li key={r.slug} className="flex"><div className="flex w-full flex-col [&>article]:flex-1"><InsightCard a={r} locale={locale} /></div></li>
              ),
            )}
          </ul>
        </section>
      )}
    </article>
  );
}
