import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { articleBase, articleHref } from "@/lib/article-href";
import { DiscussionBox } from "@/components/community/DiscussionBox";
import { seo } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/site";
import { getArticle, getArticles } from "@/lib/content";
import { Cover, KeywordChips, Meta, RichText, TopicChip } from "@/components/content/parts";
import { Locked } from "@/components/Locked";
import { VideoPoster } from "@/components/content/VideoPoster";
import { InsightCard } from "@/components/content/InsightCard";
import { ShareButtons } from "@/components/content/ShareButtons";

type Section = "/analysis" | "/articles";

/** Metadata of one article page; canonical at its own section (articleHref). */
export async function articleMetadata(locale: Locale, slug: string): Promise<Metadata> {
  const a = await getArticle(locale, slug);
  if (!a) return {};
  const base = await seo(locale, articleHref(a), { title: a.title, description: a.summary, type: "article" });
  return { ...base, openGraph: { ...base.openGraph, type: "article", publishedTime: a.publishedAt, ...(a.coverUrl ? { images: [a.coverUrl] } : {}) } };
}

/**
 * One article (the pages /analysis/[slug] and /articles/[slug]). A locked analysis / forecast shows its teaser and the
 * upgrade box: the API sent no body. An article opened under the other section is sent to its own (permanently).
 */
export async function ArticleView({ locale, slug, section }: { locale: Locale; slug: string; section: Section }) {
  setRequestLocale(locale);
  const t = await getTranslations();
  const a = await getArticle(locale, slug);
  if (a === null) notFound();
  if (!a) return <p className="mx-auto max-w-3xl px-4 py-16 text-down">{t("error.apiDown")}</p>;
  if (articleBase(a.type) !== section) permanentRedirect(locale === "en" ? `/en${articleHref(a)}` : articleHref(a));
  const educational = a.type === "article";
  const plan = a.requiredPlan ?? "gold";
  const insight = a.type === "analysis" || a.type === "forecast";
  // More on the same metal (or category) at the end, so a reader (or a locked one) has somewhere to go next.
  const related = ((await getArticles(locale, { ...(educational ? { type: ["article"] } : {}), ...(a.metal ? { metal: a.metal.slug } : a.category ? { category: a.category.slug } : {}), limit: 4 }))?.items ?? [])
    .filter((r) => r.slug !== a.slug)
    .slice(0, 3);
  const url = `${SITE_URL}${locale === "en" ? "/en" : ""}${articleHref(a)}`;

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
    ...(a.coverUrl ? { image: [a.coverUrl.startsWith("/") ? `${SITE_URL}${a.coverUrl}` : a.coverUrl] } : {}), // a picture of the site itself: a full address
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
            { "@type": "ListItem", position: 2, name: t(educational ? "nav.articles" : "nav.analysis"), item: `${SITE_URL}${locale === "en" ? "/en" : ""}${section}` },
            { "@type": "ListItem", position: 3, name: a.title },
          ],
        }}
      />
      <Link href={section} className="inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-bold text-text-2 hover:text-gold-dark">{t(educational ? "articles.back" : "analysis.back")}</Link>

      <header className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${insight ? "bg-gold/15 text-gold-dark" : "bg-surface-2 text-text-2"}`}>{t(`analysis.type.${a.type}`)}</span>
          <TopicChip a={a} />
        </div>
        <h1 className="text-2xl font-extrabold leading-10 sm:text-3xl">{a.title}</h1>
        {a.locked ? <KeywordChips a={a} /> : <p className="text-text-2">{a.summary}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-3">
          {insight ? <span className="font-bold text-gold-dark">{t("analysis.byTeam")}</span> : a.author && <span>{t("analysis.by", { name: a.author })}</span>}
          <Meta a={a.locked ? { ...a, outlook: undefined } : a} locale={locale} />
        </div>
      </header>

      {a.videoFileUrl || a.videoUrl ? (
        <VideoPoster videoUrl={a.videoUrl} fileUrl={a.videoFileUrl} coverUrl={a.coverUrl} title={a.title} play={t("analysis.playVideo")} />
      ) : (
        a.coverUrl && <Cover a={a} className="mt-6 aspect-video rounded-card" />
      )}

      <div className="mt-8">
        {a.body ? (
          <RichText html={a.body} />
        ) : (
          <Locked plan={plan} title={plan === "silver" ? t("analysis.lockedTitleSilver") : t("analysis.lockedTitle", { plan: t(`lock.plan.${plan}`) })}>
            {insight ? t("analysis.lockedBody", { plan: t(`lock.plan.${plan}`) }) : t("analysis.lockedBodyNews")}
          </Locked>
        )}
      </div>

      {insight && <p className="mt-8 rounded-card border border-border bg-surface-2 p-4 text-xs leading-6 text-text-2">{t("analysis.disclaimer")}</p>}
      {/* Stars and comments for readers of the article (client, 2026-11-02): the experts' analyses are Gold. */}
      {a.id && !a.locked && (
        <section className="mt-8 rounded-card border border-border bg-surface p-4 shadow-soft">
          <h2 className="mb-2 font-extrabold">{t("discussion.title")}</h2>
          <DiscussionBox kind="article" id={a.id} open />
        </section>
      )}
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
              r.type === "news" || r.type === "article" ? (
                <li key={r.slug}>
                  <Link href={articleHref(r)} className="block rounded-card border border-border bg-surface p-4 shadow-soft hover:border-gold/60">
                    <span className="font-bold leading-7">{r.title}</span>
                    {r.locked ? <span className="mt-2 block"><KeywordChips a={r} /></span> : <span className="mt-1 line-clamp-2 block text-sm text-text-2">{r.summary}</span>}
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
