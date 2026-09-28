import { getTranslations } from "next-intl/server";
import { formatBp, formatDate, formatPriceValue, priceUnitLabel, type Locale } from "@alanfelez/ui/format";
import type { PriceAlert } from "@/lib/gold";
import type { PriceRow } from "@/lib/prices";
import { Locked } from "@/components/Locked";
import { createAlertAction, deleteAlertAction, toggleAlertAction } from "@/app/[locale]/account/actions";

/**
 * SMS price alerts on the account page (Gold, #19). Without Gold the list stays visible (to pause or delete old
 * alerts) and the form is replaced by the upgrade box.
 */
export async function AlertsSection({ alerts, max, series, allowed, locale, error }: {
  alerts: PriceAlert[];
  max: number;
  series: PriceRow[];
  allowed: boolean;
  locale: Locale;
  error?: string;
}) {
  const t = await getTranslations("alerts");
  const tl = await getTranslations("lock");
  const input = "rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold";
  const describe = (a: PriceAlert) => {
    if (a.kind === "move") return `${t("kinds.move")} ${formatBp(a.moveBp ?? 0, locale).replace(/[+\u200e\u200f]/g, "")}`;
    const price = { amount: a.threshold ?? "0", currency: a.currency, unit: a.unit } as const;
    return `${t(`kinds.${a.kind}`)} ${formatPriceValue(price, locale)} ${priceUnitLabel(price, locale)}`;
  };

  return (
    <section id="alerts" className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-bold">{t("title")}</h2>
          <p className="mt-1 text-xs text-text-2">{t("subtitle")}</p>
        </div>
        {allowed && <span className="text-xs text-text-3">{t("count", { n: alerts.length, max })}</span>}
      </div>
      {alerts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-text-2">{t("none")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {alerts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-bold">{a.product}</span>
                <span className="text-xs text-text-2">{describe(a)}</span>
                {a.lastTriggeredAt && <span className="ms-2 text-xs text-text-3">{t("lastSent", { date: formatDate(a.lastTriggeredAt, locale, true) })}</span>}
              </span>
              <span className="flex items-center gap-2">
                {!a.active && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-2">{t("paused")}</span>}
                {(allowed || a.active) && (
                  <form action={toggleAlertAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={String(!a.active)} />
                    <button className="rounded-lg border border-border px-3 py-1 text-xs hover:border-gold">{a.active ? t("pause") : t("resume")}</button>
                  </form>
                )}
                <form action={deleteAlertAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="rounded-lg px-2 py-1 text-xs text-text-3 hover:text-down">{t("delete")}</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border px-5 py-4">
        {allowed ? (
          <form action={createAlertAction} className="space-y-3">
            <p className="text-sm font-bold">{t("new")}</p>
            {error && <p role="alert" className="rounded-control bg-down-bg px-3 py-2 text-sm text-down">{t(error === "full" ? "full" : error === "locked" ? "locked" : "invalid", { plan: tl("plan.gold") })}</p>}
            <input type="hidden" name="locale" value={locale} />
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <select name="series" required aria-label={t("series")} className={input}>
                {series.map((r) => (
                  <option key={r.series.slug} value={`${r.series.slug}:${r.series.currency}`}>
                    {r.series.product.name} · {r.series.market.name} ({priceUnitLabel(r.series, locale)})
                  </option>
                ))}
              </select>
              <select name="kind" aria-label={t("kind")} className={input}>
                {(["above", "below", "move"] as const).map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
              </select>
              <input name="value" required inputMode="decimal" dir="ltr" placeholder={t("value")} aria-label={t("value")} className={input} />
              <button className="rounded-lg bg-graphite px-4 py-2 text-sm font-bold text-white hover:bg-graphite-2">{t("add")}</button>
            </div>
            <p className="text-xs text-text-3">{t("note")}</p>
          </form>
        ) : (
          <Locked plan="gold">{t("locked", { plan: tl("plan.gold") })}</Locked>
        )}
      </div>
    </section>
  );
}
