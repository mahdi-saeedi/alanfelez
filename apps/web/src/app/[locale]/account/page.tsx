import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getMe, getMyOrders, type Order } from "@/lib/account";
import { keycloakAction, signInTo } from "@/lib/actions";
import { TierBadge } from "@/components/Locked";
import { refundAction } from "./actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

/** Account (SCOPE §5 #15): profile, plan, billing history. Alerts, saved calculations and tickets come in M4/M5. */
export default async function AccountPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const here = `${locale === "en" ? "/en" : ""}/account`;
  const me = await getMe();
  if (!me) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">{t("account.loginTitle")}</h1>
        <form action={signInTo.bind(null, here, locale)} className="mt-6">
          <button className="rounded-lg bg-gold px-6 py-2.5 font-bold text-graphite hover:bg-gold-light">{t("auth.login")}</button>
        </form>
      </section>
    );
  }
  const orders = await getMyOrders();
  const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
  const toman = (rial: string) => `${formatNumber(BigInt(rial) / 10n, locale)} ${locale === "fa" ? "تومان" : "Toman"}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{t("account.title")}</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-card border border-border bg-surface p-5 shadow-soft">
          <h2 className="font-bold">{t("account.profile")}</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Item label={t("account.name")} value={name || t("account.notSet")} />
            <Item label={t("account.phone")} value={me.phone ?? me.username} ltr />
            <Item label={t("account.email")} value={me.email ?? t("account.notSet")} ltr={!!me.email} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <form action={keycloakAction.bind(null, "UPDATE_PROFILE", here, locale)}>
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-gold">{t("account.editProfile")}</button>
            </form>
            <form action={keycloakAction.bind(null, "UPDATE_PASSWORD", here, locale)}>
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-gold">{t("account.setPassword")}</button>
            </form>
          </div>
          <p className="mt-2 text-xs text-text-3">{t("account.passwordHint")}</p>
        </section>

        <section className="rounded-card border border-border bg-surface p-5 shadow-soft">
          <h2 className="font-bold">{t("account.plan")}</h2>
          {me.current ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <TierBadge plan={me.current.plan} label={t(`lock.plan.${me.current.plan}`)} />
                <span className="text-sm text-text-2">{t("account.until", { date: formatDate(me.current.endsAt, locale) })}</span>
              </div>
              {me.next && (
                <p className="text-sm text-text-2">{t("account.next", { plan: t(`lock.plan.${me.next.plan}`), date: formatDate(me.next.startsAt, locale) })}</p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-text-2">{t("account.free")}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {me.tier !== "gold" && (
              <Link href={{ pathname: "/checkout", query: { plan: "gold", period: "month" } }} className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-graphite hover:bg-gold-light">
                {t("account.upgrade")}
              </Link>
            )}
            {me.current && (
              <Link href={{ pathname: "/checkout", query: { plan: me.current.plan, period: "month" } }} className="rounded-lg border border-border px-4 py-2 text-sm font-bold hover:border-gold">
                {t("account.renew")}
              </Link>
            )}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-surface shadow-soft">
        <h2 className="border-b border-border px-5 py-4 font-bold">{t("account.billing")}</h2>
        {orders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-2">{t("account.noOrders")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2 text-xs text-text-2">
                <tr>
                  {(["date", "plan", "period", "amount", "status", "ref"] as const).map((c) => (
                    <th key={c} className="px-4 py-3 text-start font-bold">{t(`account.col.${c}`)}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <OrderRow key={o.id} o={o} locale={locale} toman={toman} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function OrderRow({ o, locale, toman, t }: { o: Order; locale: Locale; toman: (r: string) => string; t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3 tabular-nums">{formatDate(o.paidAt ?? o.createdAt, locale)}</td>
      <td className="px-4 py-3">{t(`lock.plan.${o.plan}`)}</td>
      <td className="px-4 py-3">{t(`plans.${o.period}`)}</td>
      <td className="px-4 py-3 tabular-nums">{toman(o.amount.amount)}</td>
      <td className="px-4 py-3">{t(`account.status.${o.status}`)}</td>
      <td className="px-4 py-3 tabular-nums text-text-3" dir="ltr">{o.refId ?? "—"}</td>
      <td className="px-4 py-3">
        {o.refundStatus ? (
          <span className="text-xs text-text-2">{t(`account.refund.${o.refundStatus}`)}</span>
        ) : o.refundable ? (
          <details>
            <summary className="cursor-pointer text-xs text-gold-dark">{t("account.refund.request")}</summary>
            <form action={refundAction} className="mt-2 w-56 space-y-2">
              <input type="hidden" name="order" value={o.id} />
              <p className="text-xs text-text-2">{t("account.refund.confirm")}</p>
              <textarea name="reason" rows={2} placeholder={t("account.refund.reason")} className="w-full rounded-lg border border-border p-2 text-xs" />
              <button className="rounded-lg bg-graphite px-3 py-1.5 text-xs text-white">{t("account.refund.send")}</button>
            </form>
          </details>
        ) : null}
      </td>
    </tr>
  );
}

function Item({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-2">{label}</dt>
      <dd dir={ltr ? "ltr" : undefined}>{value}</dd>
    </div>
  );
}
