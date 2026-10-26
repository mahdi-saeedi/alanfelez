import { getTranslations } from "next-intl/server";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
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
 * 🔒 line in their place.
 */
export async function AuctionCard({ a, locale, locked }: { a: Auction; locale: Locale; locked: boolean }) {
  const t = await getTranslations("auctions");
  const deadlinePassed = a.deadlineAt ? Date.parse(a.deadlineAt) < Date.now() : false;
  return (
    <article className="flex h-full flex-col rounded-card border border-border bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-0.5 font-bold ${STATUS_STYLE[a.status]}`}>{t(`status.${a.status}`)}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-text-2">{a.metal.name}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-text-2">{t(`category.${a.category}`)}</span>
      </div>
      <h3 className="mt-3 font-bold leading-7">{a.title}</h3>
      <p className="mt-2 text-sm text-text-2">
        {t("quantity")}: <span className="font-bold text-text tabular-nums">{formatNumber(a.quantity, locale)} {t(`unit.${a.unit}`)}</span>
      </p>

      {locked ? (
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
      <p className="mt-3 text-xs text-text-3">{t("published", { date: formatDate(a.publishedAt, locale) })}</p>
    </article>
  );
}
