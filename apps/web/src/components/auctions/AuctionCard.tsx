import { getTranslations } from "next-intl/server";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { LockIcon } from "@/components/Locked";
import type { Auction } from "@/lib/gold";

const STATUS_STYLE = {
  open: "bg-up-bg text-up",
  paused: "bg-gold/15 text-gold-dark",
  closed: "bg-surface-2 text-text-2",
} as const;

/**
 * One metal auction («مزایدات»). Everyone sees the title, metal, category, quantity and status. The deadline, place,
 * organiser, details and PDF are only in `a` for Gold callers (the API leaves them out otherwise); `locked` shows the
 * 🔒 line in their place, with «ارتقا برای مشاهده‌ی جزئیات» (client, 2026-10-27, like the analysis cards). `compact` (home
 * preview) leaves the details out for everyone and links Gold readers to the card on /auctions instead.
 */
export async function AuctionCard({ a, locale, locked, compact = false }: { a: Auction; locale: Locale; locked: boolean; compact?: boolean }) {
  const t = await getTranslations("auctions");
  const deadlinePassed = a.deadlineAt ? Date.parse(a.deadlineAt) < Date.now() : false;
  const button = "shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold";
  return (
    <article id={`auction-${a.id}`} className={`flex h-full scroll-mt-24 flex-col rounded-card border bg-surface p-5 shadow-soft ${locked ? "border-gold/60" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-0.5 font-bold ${STATUS_STYLE[a.status]}`}>{t(`status.${a.status}`)}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-text-2">{a.metal.name}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-text-2">{t(`category.${a.category}`)}</span>
      </div>
      <h3 className="mt-3 font-bold leading-7">{a.title}</h3>
      <p className="mt-2 text-sm text-text-2">
        {t("quantity")}: <span className="font-bold text-text tabular-nums">{formatNumber(a.quantity, locale)} {t(`unit.${a.unit}`)}</span>
      </p>

      {compact ? null : locked ? (
        <p className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs text-text-3">
          <LockIcon className="h-4 w-4 shrink-0 text-gold-dark" />
          {t("lockedLine")}
        </p>
      ) : (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
          <p>
            <span className="text-text-3">{t("deadline")}: </span>
            {a.deadlineAt ? (
              <span className={deadlinePassed ? "text-text-3 line-through" : "font-bold"}>{formatDate(a.deadlineAt, locale, true)}</span>
            ) : (
              <span className="text-text-3">—</span>
            )}
          </p>
          {a.location && <p><span className="text-text-3">{t("location")}: </span>{a.location}</p>}
          {a.organizer && <p><span className="text-text-3">{t("organizer")}: </span>{a.organizer}</p>}
          {a.details && <p className="whitespace-pre-line leading-7 text-text-2">{a.details}</p>}
          {a.hasPdf && (
            <p className="pt-1">
              <a href={`/api/auctions/${a.id}/pdf`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 px-3 py-1.5 text-sm font-bold text-gold-dark hover:bg-gold/10">
                {t("pdf")}
              </a>
            </p>
          )}
        </div>
      )}
      <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 ${compact ? "mt-auto border-t border-border pt-3" : ""}`}>
        <p className="text-xs text-text-3">{t("published", { date: formatDate(a.publishedAt, locale) })}</p>
        {locked ? (
          <Link href="/plans" className={`${button} bg-gold text-graphite hover:bg-gold-light`}>{t("upgrade")}</Link>
        ) : (
          compact && <Link href={`/auctions#auction-${a.id}`} className={`${button} bg-graphite text-white hover:bg-graphite-2`}>{t("details")}</Link>
        )}
      </div>
    </article>
  );
}
