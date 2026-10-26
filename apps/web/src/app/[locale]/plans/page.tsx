import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Schemas } from "@alanfelez/api-client";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { getMe } from "@/lib/account";
import { PlanCards, PLAN_FEATURES as FEATURES } from "@/components/PlanCards";

export const dynamic = "force-dynamic";

type Period = Schemas["BillingPeriod"];
const PERIODS: Period[] = ["month", "quarter", "year"];

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ period?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return seo(locale, "/plans", { title: t("nav.plans"), description: t("plans.subtitle") });
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

      <PlanCards plans={data} me={me} period={period} locale={locale} />

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
