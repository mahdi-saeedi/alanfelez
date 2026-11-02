import { getTranslations } from "next-intl/server";
import type { Schemas } from "@alanfelez/api-client";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { planFeatures } from "@/components/PlanCards";

/**
 * Home page, for Silver members instead of the three plan cards (client, 2026-11-02): what they have next to what Gold
 * adds, with the upgrade button. The checkout credits the unused Silver days (billing.QuoteFor), so they pay the
 * difference only. Gold members see no plans block; free members and visitors see the three cards.
 */
export async function SilverUpgrade({ plans, endsAt, purchasable, locale }: { plans: Schemas["Plan"][]; endsAt?: string; purchasable: boolean; locale: Locale }) {
  const t = await getTranslations();
  const silver = plans.find((p) => p.code === "silver");
  const gold = plans.find((p) => p.code === "gold");
  if (!silver || !gold) return null;
  const rows = planFeatures().filter((f) => silver.features[f] || gold.features[f]);
  const days = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 86_400_000)) : undefined;
  return (
    <div className="mt-8 grid overflow-hidden rounded-card border border-border bg-surface shadow-card md:grid-cols-[1.1fr_1fr]">
      <div className="bg-gradient-to-br from-graphite to-graphite-2 p-6 text-white sm:p-8">
        <span className="inline-flex rounded-full bg-[#e2e8f0] px-3 py-1 text-xs font-bold text-graphite-3">
          {days !== undefined ? t("home.upgrade.current", { days: formatNumber(days, locale) }) : t("home.upgrade.currentNoDate")}
        </span>
        <h3 className="mt-4 text-2xl font-extrabold">{t.rich("home.upgrade.title", { gold: (c) => <span className="text-gold-light">{c}</span> })}</h3>
        <p className="mt-2 leading-8 text-silver-light">{t("home.upgrade.text")}</p>
        {purchasable ? (
          <Link href={{ pathname: "/checkout", query: { plan: "gold", period: "month" } }} className="mt-5 inline-block rounded-lg bg-gold px-6 py-3 font-extrabold text-graphite hover:bg-gold-light">
            {t("home.upgrade.cta")}
          </Link>
        ) : (
          <span className="mt-5 inline-block cursor-not-allowed rounded-lg bg-graphite-3 px-6 py-3 font-bold text-silver-light">{t("home.upgrade.cta")}</span>
        )}
        <p className="mt-3 text-xs text-silver-light">{t("home.upgrade.credit")}</p>
      </div>
      <div className="p-6 sm:p-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-3">
              <th className="pb-2 text-start font-bold">{t("plans.feature")}</th>
              <th className="pb-2 text-center font-bold">{silver.name}</th>
              <th className="pb-2 text-center font-bold text-gold-dark">{gold.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const extra = !silver.features[f] && gold.features[f];
              return (
                <tr key={f} className={`border-t border-border ${extra ? "bg-gold/5 font-bold" : ""}`}>
                  <td className="py-2.5 pe-2">{t(`features.${f.replace(".", "_")}`)}</td>
                  <td className="py-2.5 text-center">{silver.features[f] ? <span className="text-up">✓</span> : <span className="text-text-3">—</span>}</td>
                  <td className="py-2.5 text-center text-gold-dark">{gold.features[f] ? "✓" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
