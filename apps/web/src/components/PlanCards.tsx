import { getTranslations } from "next-intl/server";
import type { Schemas } from "@alanfelez/api-client";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { TierBadge } from "@/components/Locked";

type Period = Schemas["BillingPeriod"];
type PlanList = { items: Schemas["Plan"][]; purchasable: boolean };
// The rows of the client's plan table (2026-10-26), in its order, plus «اخبار فاندامنتال» and «تحلیل کاربران»
// (Silver, 2026-10-30).
// «تحلیل تکنیکال» is one row: analysis.read and forecast.read unlock together (Gold). What each plan includes still
// comes from the API.
export const PLAN_FEATURES = [
  "prices.base", "chart.basic", "prices.full", "chart.full", "news.read",
  "community.read", "auctions.read", "analysis.read", "calculator.use", "alerts.sms",
] as const;

/** The three plan cards (plans page and home page), from GET /v1/plans. */
export async function PlanCards({ plans: data, me, period, locale }: { plans: PlanList; me: { tier?: string } | null; period: Period; locale: Locale }) {
  const t = await getTranslations();
  const toman = (rial: string) => formatNumber(BigInt(rial) / 10n, locale);
  return (
      <ul className="mt-8 grid items-stretch gap-5 md:grid-cols-3">
        {data.items.map((plan) => {
          const code = plan.code;
          const gold = code === "gold";
          const price = plan.prices.find((x) => x.period === period);
          const current = me?.tier === code;
          return (
            <li
              key={code}
              className={`relative flex flex-col rounded-card bg-surface p-6 ${gold ? "border-2 border-gold shadow-card md:-my-2 md:py-8" : "border border-border shadow-soft"}`}
            >
              {gold && <span className="absolute -top-3 start-6 rounded-full bg-gold px-3 py-0.5 text-xs font-bold text-graphite">{t("plans.popular")}</span>}
              <div className="flex items-center justify-between">
                <h2 className={`text-xl font-extrabold ${gold ? "text-gold-dark" : ""}`}>{plan.name}</h2>
                {current && <TierBadge plan={code} label={t("plans.current")} />}
              </div>
              <p className="mt-1 text-sm text-text-3">{t(`plans.audience.${code}`)}</p>
              <p className="mt-5 text-3xl font-extrabold tabular-nums">{price ? toman(price.price.amount) : formatNumber(0, locale)}</p>
              <p className="text-xs text-text-3">{t(`plans.unit.${price ? period : "month"}`)}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {PLAN_FEATURES.map((f) =>
                  plan.features[f] ? (
                    <li key={f} className="flex gap-2">
                      <span className="text-up" aria-hidden>✓</span>
                      {t(`features.${f.replace(".", "_")}`)}
                    </li>
                  ) : (
                    // What the plan doesn't include, greyed out: the cards then compare like the table on /plans.
                    <li key={f} className="flex gap-2 text-text-3">
                      <span aria-hidden>—</span>
                      <span><span className="sr-only">{t("plans.notIncluded")}: </span>{t(`features.${f.replace(".", "_")}`)}</span>
                    </li>
                  ),
                )}
              </ul>
              <div className="mt-6">
                {code === "free" ? (
                  <Link href={me ? "/prices" : "/account"} className="block rounded-lg border border-border px-4 py-2.5 text-center text-sm font-bold hover:border-gold">
                    {t("plans.cta.free")}
                  </Link>
                ) : data.purchasable ? (
                  <Link
                    href={{ pathname: "/checkout", query: { plan: code, period } }}
                    className={`block rounded-lg px-4 py-2.5 text-center text-sm font-bold ${gold ? "bg-gold text-graphite hover:bg-gold-light" : "bg-graphite text-white hover:bg-graphite-2"}`}
                  >
                    {t(`plans.cta.${code}`)}
                  </Link>
                ) : (
                  <span className="block cursor-not-allowed rounded-lg bg-surface-2 px-4 py-2.5 text-center text-sm font-bold text-text-3">{t(`plans.cta.${code}`)}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
  );
}
