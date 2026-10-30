import { getTranslations } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { LockIcon } from "@/components/Locked";
import { Meta } from "./parts";
import type { ArticleSummary } from "@/lib/content";

/** Gold analysis / forecast teaser. Locked: title + summary only, with the upgrade CTA (no body exists here). */
export async function InsightCard({ a, locale }: { a: ArticleSummary; locale: Locale }) {
  const t = await getTranslations("analysis");
  return (
    <article className={`flex flex-col gap-2 rounded-card border bg-surface p-4 shadow-soft ${a.locked ? "border-gold/60" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-bold text-gold-dark">{t(`type.${a.type}`)}</span>
        {a.locked && <LockIcon className="h-5 w-5" />}
      </div>
      <h3 className="font-bold leading-7">{a.title}</h3>
      {/* Written by the Alan Felez team (client, 2026-10-30); members' own analyses will carry their name instead. */}
      <p className="text-xs font-bold text-gold-dark">{t("byTeam")}</p>
      <p className="line-clamp-2 flex-1 text-sm text-text-2">{a.summary}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Meta a={a} locale={locale} />
        {a.locked ? (
          <Link href="/plans" className="rounded-lg bg-gold px-3 py-2 text-xs font-bold text-graphite hover:bg-gold-light">{t("readToUnlock")}</Link>
        ) : (
          <Link href={`/analysis/${a.slug}`} className="rounded-lg bg-graphite px-3 py-2 text-xs font-bold text-white hover:bg-graphite-2">{t("read")}</Link>
        )}
      </div>
    </article>
  );
}
