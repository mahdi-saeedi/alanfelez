import type { Metadata } from "next";
import type { Locale } from "@alanfelez/ui/format";
import { ArticleView, articleMetadata } from "@/components/content/ArticleView";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  return articleMetadata(locale, slug);
}

/** One news item or analysis (an educational article opened here is sent to /articles). */
export default async function AnalysisArticlePage({ params }: Params) {
  const { locale, slug } = await params;
  return <ArticleView locale={locale} slug={slug} section="/analysis" />;
}
