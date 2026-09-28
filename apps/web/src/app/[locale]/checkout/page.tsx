import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getQuote, type PaidPlan, type Period } from "@/lib/account";
import { signInTo } from "@/lib/actions";
import { payAction } from "./actions";

export const dynamic = "force-dynamic";

const PLANS: PaidPlan[] = ["silver", "gold"];
const PERIODS: Period[] = ["month", "quarter", "year"];
const ERRORS = ["PAYMENTS_DISABLED", "UPSTREAM_UNAVAILABLE", "FORBIDDEN"];

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ plan?: string; period?: string; error?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false } };
}

/** Checkout review (SCOPE §5 #16): the API prices it (credit, start date); the user confirms and goes to the gateway. */
export default async function CheckoutPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const q = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const plan: PaidPlan = PLANS.includes(q.plan as PaidPlan) ? (q.plan as PaidPlan) : "gold";
  const period: Period = PERIODS.includes(q.period as Period) ? (q.period as Period) : "month";
  const here = `${locale === "en" ? "/en" : ""}/checkout?plan=${plan}&period=${period}`;

  const { quote, status } = await getQuote(plan, period);
  if (status === 401) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">{t("checkout.loginTitle")}</h1>
        <p className="mt-3 text-text-2">{t("checkout.loginBody")}</p>
        <form action={signInTo.bind(null, here, locale)} className="mt-6">
          <button className="rounded-lg bg-gold px-6 py-2.5 font-bold text-graphite hover:bg-gold-light">{t("auth.login")}</button>
        </form>
      </section>
    );
  }
  if (!quote) {
    return <p className="mx-auto max-w-md px-4 py-16 text-center text-down">{t("checkout.error.generic")}</p>;
  }

  const toman = (rial: string) => `${formatNumber(BigInt(rial) / 10n, locale)} ${locale === "fa" ? "تومان" : "Toman"}`;
  const planName = t(`lock.plan.${plan}`);
  const error = q.error === "agree" ? null : q.error ? (ERRORS.includes(q.error) ? q.error : "generic") : null;
  const due = BigInt(quote.amount.amount) > 0n;

  return (
    <section className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-extrabold">{t("checkout.title")}</h1>
      <div className="mt-6 rounded-card border border-border bg-surface shadow-soft">
        <dl className="divide-y divide-border text-sm">
          <Row label={t("checkout.plan")} value={planName} strong />
          <Row label={t("checkout.period")} value={t(`plans.${period}`)} />
          <Row label={t("checkout.starts")} value={formatDate(quote.startsAt, locale)} />
          <Row label={t("checkout.ends")} value={formatDate(quote.endsAt, locale)} />
          <Row label={t("checkout.price")} value={toman(quote.price.amount)} />
          {BigInt(quote.credit.amount) > 0n && <Row label={t("checkout.credit")} value={`− ${toman(quote.credit.amount)}`} tone="text-up" />}
          <Row label={t("checkout.amount")} value={toman(quote.amount.amount)} strong />
        </dl>
        <p className="border-t border-border bg-surface-2 px-5 py-3 text-sm text-text-2">
          {t(`checkout.kind.${quote.kind === "upgrade" && BigInt(quote.credit.amount) === 0n ? "upgradeNoCredit" : quote.kind}`, {
            date: formatDate(quote.startsAt, locale),
          })}
        </p>
      </div>

      {error && <p className="mt-4 rounded-lg bg-down-bg px-4 py-3 text-sm text-down">{t(`checkout.error.${error}`)}</p>}

      <form action={payAction} className="mt-6 space-y-4">
        <input type="hidden" name="plan" value={plan} />
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="locale" value={locale} />
        {/* One key per page view: a double submit reuses the same order and payment. */}
        <input type="hidden" name="key" value={randomUUID()} />
        <label className={`flex items-start gap-2 text-sm ${q.error === "agree" ? "text-down" : ""}`}>
          <input type="checkbox" name="agree" required className="mt-1" />
          <span>
            {t("checkout.agree")}{" "}
            <Link href="/terms" className="text-gold-dark underline">{t("checkout.terms")}</Link>
          </span>
        </label>
        <button className="w-full rounded-lg bg-gold px-6 py-3 font-bold text-graphite hover:bg-gold-light">
          {due ? t("checkout.pay", { amount: toman(quote.amount.amount) }) : t("checkout.activate")}
        </button>
        <p className="text-xs text-text-3">{t("checkout.refundNote")}</p>
        <Link href={{ pathname: "/plans", query: { period } }} className="block text-center text-sm text-text-2 hover:text-gold-dark">
          {t("checkout.back")}
        </Link>
      </form>
    </section>
  );
}

function Row({ label, value, strong = false, tone = "" }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-text-2">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-base font-extrabold" : ""} ${tone}`}>{value}</dd>
    </div>
  );
}
