import { getTranslations } from "next-intl/server";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { OutlookPill, metalTone } from "@/components/content/parts";
import type { CommunityPost } from "@/lib/community";
import { ExpandableText } from "./ExpandableText";
import { DeletePostButton } from "./DeletePostButton";

/**
 * A member's analysis (client, 2026-10-30), only ever rendered for Silver and Gold (the API sends no posts to others).
 * The byline is blue «تحلیل توسط <name>», unlike the gold «تحلیل توسط تحلیل‌گران الان‌فلز» on the team's analyses,
 * so it's always clear who wrote what; each card repeats that it's the member's own view.
 */
export async function CommunityCard({ p, locale }: { p: CommunityPost; locale: Locale }) {
  const t = await getTranslations("analysis.community");
  return (
    <article className="flex flex-col gap-2 rounded-card border border-info/30 bg-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-bold text-info">{t("badge")}</span>
        {p.metal && (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metalTone(p.metal.slug) }} aria-hidden />
            {p.metal.name}
          </span>
        )}
      </div>
      <h3 className="font-bold leading-7">{p.title}</h3>
      <p className="text-xs font-bold text-info">{t("by", { name: p.authorName })}</p>
      <ExpandableText text={p.body} more={t("more")} less={t("less")} />
      {p.hasImage && (
        <a href={`/api/community/${p.id}/image`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border border-border">
          <img src={`/api/community/${p.id}/image`} alt={t("chartAlt", { title: p.title })} loading="lazy" className="max-h-72 w-full bg-surface-2 object-contain" />
        </a>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-3">
          <time dateTime={p.createdAt}>{formatDate(p.createdAt, locale, true)}</time>
          <OutlookPill outlook={p.outlook} />
        </div>
        {p.mine && <DeletePostButton id={p.id} label={t("delete")} confirm={t("deleteConfirm")} />}
      </div>
      <p className="text-[11px] leading-5 text-text-3">{t("ownView")}</p>
    </article>
  );
}
