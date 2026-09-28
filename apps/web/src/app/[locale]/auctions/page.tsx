import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatBp, formatDate, formatNumber, formatToman, formatTons, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getAuctions } from "@/lib/gold";
import { getMetals } from "@/lib/content";
import { Locked } from "@/components/Locked";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ date?: string; metal?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auctions" });
  return { title: t("title"), description: t("subtitle"), alternates: { languages: { fa: "/auctions", en: "/en/auctions" } } };
}

/**
 * IME daily offerings (SCOPE §7). Everyone sees the day's summary; the table is Gold. Locked rows are never sent by
 * the API, so the teaser below the summary is a placeholder, not blurred data.
 */
export default async function AuctionsPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auctions");
  const tl = await getTranslations("lock");
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  const [day, metals] = await Promise.all([getAuctions(locale, { date, metal: sp.metal }), getMetals(locale)]);
  if (!day) return <p className="mx-auto max-w-7xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  const plan = day.requiredPlan ?? "gold";
  const s = day.summary;
  const cards = [
    [t("offerings"), formatNumber(s.offerings, locale)],
    [t("offered"), formatTons(s.offeredKg, locale)],
    [t("demand"), formatTons(s.demandKg, locale)],
    [t("traded"), formatTons(s.tradedKg, locale)],
    [t("value"), formatToman(s.value.amount, locale)],
    [t("avgChange"), formatBp(s.avgChangeBp, locale)],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-text-2">{t("subtitle")}</p>
      </header>

      {!day.date ? (
        <p className="rounded-card border border-border bg-surface p-8 text-center text-text-2">{t("noData")}</p>
      ) : (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-3" action="">
            <AutoSubmitSelect name="date" value={day.date} label={t("date")}>
              {day.dates.map((d) => (
                <option key={d} value={d}>{formatDate(`${d}T12:00:00Z`, locale)}</option>
              ))}
            </AutoSubmitSelect>
            {sp.metal && <input type="hidden" name="metal" value={sp.metal} />}
            <noscript><button className="rounded-control border border-border px-3 py-2 text-sm">{t("go")}</button></noscript>
          </form>
          <nav className="mb-6 flex flex-wrap gap-2">
            {[{ slug: undefined, name: t("all") }, ...metals].map((m) => {
              const on = m.slug === sp.metal;
              return (
                <Link
                  key={m.slug ?? "all"}
                  href={{ pathname: "/auctions", query: Object.fromEntries(Object.entries({ date: day.date, metal: m.slug }).filter((e): e is [string, string] => !!e[1])) }}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-full border px-4 py-1.5 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface text-text-2 hover:border-gold"}`}
                >
                  {m.name}
                </Link>
              );
            })}
          </nav>

          <ul className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map(([label, value]) => (
              <li key={label} className="rounded-card border border-border bg-surface p-4 shadow-soft">
                <div className="text-xs text-text-2">{label}</div>
                <div className="mt-1 text-lg font-extrabold tabular-nums">{value}</div>
              </li>
            ))}
          </ul>

          {day.items ? (
            <div className="overflow-hidden rounded-card border border-border bg-surface shadow-soft">
              {day.items.length === 0 ? (
                <p className="p-8 text-center text-text-2">{t("empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-surface-2 text-xs text-text-2">
                      <tr>
                        {(["product", "producer", "offered", "base", "demand", "traded", "clearing", "change"] as const).map((c) => (
                          <th key={c} className="px-4 py-3 text-start font-bold">{t(`col.${c}`)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {day.items.map((o) => (
                        <tr key={o.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <div className="font-bold">{o.product}</div>
                            <div className="text-xs text-text-3">{o.metal.name}</div>
                          </td>
                          <td className="px-4 py-3 text-text-2">{o.producer}</td>
                          <td className="px-4 py-3 tabular-nums">{formatTons(o.offeredKg, locale)}</td>
                          <td className="px-4 py-3 tabular-nums">{formatNumber(o.basePriceRial / 10, locale)}</td>
                          <td className="px-4 py-3 tabular-nums">{o.demandKg !== undefined ? formatTons(o.demandKg, locale) : "—"}</td>
                          <td className="px-4 py-3 tabular-nums">{o.tradedKg !== undefined ? formatTons(o.tradedKg, locale) : "—"}</td>
                          <td className="px-4 py-3 font-bold tabular-nums">
                            {o.clearingPriceRial !== undefined ? formatNumber(o.clearingPriceRial / 10, locale) : <span className="text-xs font-normal text-text-3">{t("pending")}</span>}
                          </td>
                          <td className="px-4 py-3">
                            {o.changeBp !== undefined && (
                              <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${o.changeBp > 0 ? "bg-up-bg text-up" : o.changeBp < 0 ? "bg-down-bg text-down" : "bg-surface-2 text-text-2"}`} dir="ltr">
                                {formatBp(o.changeBp, locale)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="border-t border-border px-4 py-3 text-xs text-text-3">{t("perKg")}</p>
            </div>
          ) : (
            <div className="relative">
              <div aria-hidden className="space-y-2 rounded-card border border-border bg-surface p-4 opacity-60 blur-[2px]">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="h-8 rounded bg-surface-2" />
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <Locked plan={plan} title={t("lockedTitle", { plan: tl(`plan.${plan}`) })}>
                    {t("lockedBody", { plan: tl(`plan.${plan}`) })}
                  </Locked>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-text-3">
            <span>{t("source", { source: day.source })}</span>
            {day.updatedAt && <span>{t("updated", { time: formatDate(day.updatedAt, locale, true) })}</span>}
          </div>
          <p className="mt-2 text-xs text-text-3">{t("info")}</p>
        </>
      )}
    </div>
  );
}
