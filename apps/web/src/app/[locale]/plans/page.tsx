import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Schemas } from "@alanfelez/api-client";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { getMe } from "@/lib/account";
import { TierBadge } from "@/components/Locked";

export const dynamic = "force-dynamic";

type Period = Schemas["BillingPeriod"];
const PERIODS: Period[] = ["month", "quarter", "year"];
// Display order of the comparison rows (what each plan includes comes from the API: the matrix lives in Go).
const FEATURES = [
  "prices.base", "prices.full", "chart.basic", "chart.full", "news.read", "analysis.read",
  "forecast.read", "auctions.read", "calculator.use", "alerts.sms", "support.priority",
] as const;

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ period?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return { title: t("nav.plans"), description: t("plans.subtitle") };
}

/** Plans (SCOPE §5 #7, §6; design 12-subscriptions). Enterprise is out of v1 (SCOPE §4). */
export default async function PlansPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const { period: p } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const period: Period = PERIODS.includes(p as Period) ? (p as Period) : "month";
  const [plansRes, me] = await Promise.all([
    api.GET("/v1/plans", { params: { header: { "Accept-Language": locale } }, next: { revalidate: 60 } }),
    getMe(),
  ]);
  const data = plansRes.data;
  if (!data) return <p className="mx-auto max-w-5xl px-4 py-16 text-center text-down">{t("error.apiDown")}</p>;

  const toman = (rial: string) => formatNumber(BigInt(rial) / 10n, locale);
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-center text-3xl font-extrabold">{t("plans.title")}</h1>
      <p className="mt-3 text-center text-text-2">{t("plans.subtitle")}</p>

      <nav className="mx-auto mt-8 flex w-fit gap-1 rounded-control border border-border bg-surface p-1" aria-label="period">
        {PERIODS.map((x) => (
          <Link
            key={x}
            href={{ pathname: "/plans", query: { period: x } }}
            aria-current={x === period ? "page" : undefined}
            className={`relative rounded-lg px-4 py-1.5 text-sm ${x === period ? "bg-graphite font-bold text-white" : "text-text-2 hover:bg-surface-2"}`}
          >
            {t(`plans.${x}`)}
            {x !== "month" && <span className="ms-2 rounded-full bg-gold-light/40 px-1.5 text-[10px] font-bold text-gold-dark">{t(`plans.save.${x}`)}</span>}
          </Link>
        ))}
      </nav>

      {!data.purchasable && <p className="mt-4 text-center text-sm text-text-2">{t("plans.soon")}</p>}

      <ul className="mt-8 grid items-stretch gap-5 md:grid-cols-3">
        {data.items.map((plan) => {
          const code = plan.code;
          const gold = code === "gold";
          const price = plan.prices.find((x) => x.period === period);
          const current = me?.tier === code;
          const features = FEATURES.filter((f) => plan.features[f]);
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
                {features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-up" aria-hidden>✓</span>
                    {t(`features.${f.replace(".", "_")}`)}
                  </li>
                ))}
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

      <div className="mt-14 overflow-x-auto rounded-card border border-border bg-surface shadow-soft">
        <h2 className="border-b border-border px-5 py-4 font-extrabold">{t("plans.compareTitle")}</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface-2 text-xs text-text-2">
            <tr>
              <th className="px-5 py-3 text-start font-bold">{t("plans.feature")}</th>
              {data.items.map((plan) => (
                <th key={plan.code} className="px-5 py-3 text-center font-bold">{plan.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f} className="border-t border-border">
                <td className="px-5 py-3">{t(`features.${f.replace(".", "_")}`)}</td>
                {data.items.map((plan) => {
                  const on = plan.features[f];
                  const days = plan.limits["chart.history_days"] ?? 0;
                  return (
                    <td key={plan.code} className="px-5 py-3 text-center">
                      {f === "chart.basic" && on ? (
                        <span className="text-text-2">{days ? t("plans.limitDays", { days: formatNumber(days, locale) }) : t("plans.unlimited")}</span>
                      ) : on ? (
                        <span className="text-up" aria-label="✓">✓</span>
                      ) : (
                        <span className="text-text-3" aria-label="✗">✗</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
