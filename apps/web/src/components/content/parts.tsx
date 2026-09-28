import { getTranslations } from "next-intl/server";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import type { ArticleSummary } from "@/lib/content";

/**
 * Sanitized HTML from the Go API (it's cleaned on every save, ADR-0025). This is the only place the site renders
 * HTML from data, so it's easy to audit (SECURITY T6).
 */
export function RichText({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`rich ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Metal accent colors (prototype About page chips). Unknown metals fall back to graphite.
const METAL_TONE: Record<string, string> = {
  aluminum: "#9ca3af",
  copper: "#b87333",
  brass: "#d4a017",
  zinc: "#a5a7c8",
  lead: "#5b6b82",
  iron: "#64748b",
  "cast-iron": "#3d4a5c",
};

export function metalTone(slug?: string): string {
  return (slug && METAL_TONE[slug]) || "#3d4a5c";
}

/** The chip on a card: the metal if there is one, else the category. */
export function TopicChip({ a }: { a: Pick<ArticleSummary, "metal" | "category"> }) {
  const topic = a.metal ?? a.category;
  if (!topic) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-bold text-info">
      {a.metal && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metalTone(a.metal.slug) }} aria-hidden />}
      {topic.name}
    </span>
  );
}

/** The author's view of the direction (an estimate, so it's labeled as the analyst's view). */
export async function OutlookPill({ outlook }: { outlook?: ArticleSummary["outlook"] }) {
  if (!outlook) return null;
  const t = await getTranslations("analysis");
  const tone = outlook === "up" ? "text-up" : outlook === "down" ? "text-down" : "text-text-2";
  const arrow = outlook === "up" ? "▲" : outlook === "down" ? "▼" : "●";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${tone}`} title={t("outlookLabel")}>
      <span aria-hidden className="text-[10px]">{arrow}</span>
      {t(`outlook.${outlook}`)}
    </span>
  );
}

export async function Meta({ a, locale }: { a: Pick<ArticleSummary, "publishedAt" | "readMinutes" | "outlook">; locale: Locale }) {
  const t = await getTranslations("analysis");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-3">
      <time dateTime={a.publishedAt}>{formatDate(a.publishedAt, locale)}</time>
      <span>{t("minutes", { n: formatNumber(a.readMinutes, locale) })}</span>
      <OutlookPill outlook={a.outlook} />
    </div>
  );
}

/** Cover image, or a graphite panel tinted with the metal's color when the article has none. */
export function Cover({ a, className = "" }: { a: Pick<ArticleSummary, "coverUrl" | "metal" | "title">; className?: string }) {
  if (a.coverUrl) {
    return <img src={a.coverUrl} alt="" loading="lazy" className={`w-full object-cover ${className}`} />;
  }
  const tone = metalTone(a.metal?.slug);
  return (
    <div
      aria-hidden
      className={`w-full bg-graphite ${className}`}
      style={{ backgroundImage: `radial-gradient(120% 90% at 85% 10%, ${tone}66, transparent 60%), linear-gradient(135deg, #1c2331, #282e3b)` }}
    />
  );
}
