import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { seo } from "@/lib/seo";
import { getArticles, type ArticleSummary } from "@/lib/content";
import { articleHref } from "@/lib/article-href";
import { Cover, Meta, TopicChip } from "@/components/content/parts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ page?: string }> };

const PAGE_SIZE = 12;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "articles" });
  return seo(locale, "/articles", { title: t("title"), description: t("subtitle") });
}

/** «مقالات»: educational articles, free for everyone and in the footer for SEO (client, 2026-11-04). */
export default async function ArticlesPage({ params, searchParams }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("articles");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const list = await getArticles(locale, { type: ["article"], page, limit: PAGE_SIZE });
  if (!list) return <p className="mx-auto max-w-5xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <p className="mt-2 text-text-2">{t("subtitle")}</p>
      {list.items.length === 0 ? (
        <p className="mt-10 rounded-card border border-border bg-surface p-8 text-center text-text-2">{t("empty")}</p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((a) => <li key={a.slug} className="flex"><Card a={a} locale={locale} /></li>)}
        </ul>
      )}
      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between gap-4 text-sm" aria-label="pagination">
          {page > 1 ? <Link href={{ pathname: "/articles", query: page > 2 ? { page: String(page - 1) } : {} }} className="rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-gold">{t("prev")}</Link> : <span />}
          <span className="text-text-3">{formatNumber(page, locale)} / {formatNumber(pages, locale)}</span>
          {page < pages ? <Link href={{ pathname: "/articles", query: { page: String(page + 1) } }} className="rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-gold">{t("next")}</Link> : <span />}
        </nav>
      )}
    </section>
  );
}

function Card({ a, locale }: { a: ArticleSummary; locale: Locale }) {
  return (
    <Link href={articleHref(a)} className="group flex w-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-soft hover:border-gold/60">
      <Cover a={a} className="aspect-video" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        {(a.metal || a.category) && <TopicChip a={a} />}
        <h2 className="font-extrabold leading-7 group-hover:text-gold-dark">{a.title}</h2>
        <p className="line-clamp-3 flex-1 text-sm text-text-2">{a.summary}</p>
        <Meta a={a} locale={locale} />
      </div>
    </Link>
  );
}
