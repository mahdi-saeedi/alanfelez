import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getMe, getMyOrder } from "@/lib/account";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ order?: string; status?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * Payment result. The status in the URL only picks the message; the order itself (when signed in) comes from the
 * API, which is the only place a payment is decided.
 */
export default async function ResultPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const q = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const order = q.order && /^[0-9a-f-]{36}$/i.test(q.order) ? await getMyOrder(q.order) : null;
  const status = order?.status ?? q.status;
  const me = order?.status === "paid" ? await getMe() : null;

  const paid = status === "paid";
  const retry = status === "retry" || status === "pending";
  const planName = order ? t(`lock.plan.${order.plan}`) : "";
  const queued = me?.next && order && me.next.plan === order.plan ? me.next : null;

  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${paid ? "bg-up-bg text-up" : retry ? "bg-gold/15 text-gold-dark" : "bg-down-bg text-down"}`} aria-hidden>
        {paid ? "✓" : retry ? "…" : "✗"}
      </div>
      <h1 className="mt-5 text-2xl font-extrabold">
        {t(`checkout.result.${paid ? "paidTitle" : retry ? "retryTitle" : "failedTitle"}`)}
      </h1>
      <p className="mt-3 text-text-2">
        {paid
          ? queued
            ? t("checkout.result.queuedBody", { plan: planName, date: formatDate(queued.startsAt, locale) })
            : t("checkout.result.paidBody", { plan: planName })
          : retry
            ? t("checkout.result.retryBody")
            : t("checkout.result.failedBody")}
      </p>
      {order?.refId && <p className="mt-2 text-sm text-text-3" dir="ltr">{t("checkout.result.ref", { ref: order.refId })}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {paid ? (
          <>
            <Link href="/account" className="rounded-lg bg-graphite px-5 py-2.5 text-sm font-bold text-white hover:bg-graphite-2">{t("checkout.result.account")}</Link>
            <Link href="/prices" className="rounded-lg border border-border px-5 py-2.5 text-sm font-bold hover:border-gold">{t("checkout.result.prices")}</Link>
          </>
        ) : (
          <Link
            href={order ? { pathname: "/checkout", query: { plan: order.plan, period: order.period } } : "/plans"}
            className="rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-graphite hover:bg-gold-light"
          >
            {t("checkout.result.tryAgain")}
          </Link>
        )}
      </div>
    </section>
  );
}
