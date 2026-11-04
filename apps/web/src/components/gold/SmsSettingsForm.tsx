import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import type { SmsSettings } from "@/lib/gold";
import { Locked } from "@/components/Locked";
import { buySmsMetalsAction, saveSmsSettingsAction } from "@/app/[locale]/account/actions";
import { SmsMetalPicker } from "./SmsMetalPicker";

/**
 * Gold price SMS (client, 2026-11-04). The metals are bought: at checkout with the plan, or here during the plan
 * (each at the full price of the plan's length). Paid metals can't be changed or refunded, so they show ticked and
 * locked. Paid metals get every price SMS (IME updated, market updated, ±10 % alert); the metals ticked at sign-up
 * only the IME «updated» SMS. On the account page and on the payment result page (`back`).
 */
export async function SmsSettingsForm({ settings, metals, locale, back, status }: {
  settings: SmsSettings | null;
  metals: { slug: string; name: string }[];
  locale: Locale;
  back: string;
  status?: string;
}) {
  const t = await getTranslations("sms");
  const tl = await getTranslations("lock");
  const signup = metals.filter((m) => settings?.signupMetals.includes(m.slug)).map((m) => m.name);
  const toman = (rial?: string) => (rial ? `${formatNumber(BigInt(rial) / 10n, locale)} ${locale === "fa" ? "تومان" : "Toman"}` : "");
  const unpaid = metals.filter((m) => !settings?.metals.includes(m.slug));
  return (
    <section id="sms" className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface shadow-soft">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold">{t("title")}</h2>
        <p className="mt-1 text-xs leading-6 text-text-2">{t("subtitle")}</p>
      </div>
      {!settings?.allowed ? (
        <div className="p-5"><Locked plan="gold">{t("locked", { plan: tl("plan.gold") })}</Locked></div>
      ) : (
        <div className="space-y-5 p-5">
          {settings.phone ? (
            <p className="text-xs text-text-2">
              {t("phone")} <span dir="ltr" className="font-bold tabular-nums">{localPhone(settings.phone, locale)}</span>
            </p>
          ) : (
            <p role="alert" className="rounded-lg bg-down/10 p-3 text-sm text-down">{t("noPhone")}</p>
          )}

          <form action={buySmsMetalsAction} className="space-y-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="key" value={randomUUID()} />
            <fieldset>
              <legend className="mb-1 text-sm font-bold">{t("metal")}</legend>
              <p className="mb-3 text-xs leading-6 text-text-2">{t("metalHint")}</p>
              <SmsMetalPicker
                metals={metals}
                paid={settings.metals}
                unitRial={settings.addMetalPrice?.amount ?? "0"}
                locale={locale}
                labels={{ paid: t("paidMetal"), total: t("addTotal"), pay: t("addPay"), none: t("addNone"), toman: locale === "fa" ? "تومان" : "Toman" }}
                withButton={unpaid.length > 0}
              />
            </fieldset>
            {unpaid.length > 0 && <p className="text-xs leading-6 text-text-3">{t("addHint", { price: toman(settings.addMetalPrice?.amount) })}</p>}
            <p className="rounded-lg bg-gold/10 p-3 text-xs leading-6 text-gold-dark">{t("noRefund")}</p>
          </form>

          {signup.length > 0 && (
            <p className="rounded-lg bg-surface-2 p-3 text-xs leading-6 text-text-2">
              {t("signupMetals", { metals: signup.join(locale === "fa" ? "، " : ", ") })}
            </p>
          )}

          <form action={saveSmsSettingsAction} className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="back" value={back} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
              {t("enabled")}
            </label>
            <button className="rounded-lg border border-border px-4 py-1.5 text-sm font-bold hover:border-gold">{t("save")}</button>
          </form>

          <ul className="list-disc space-y-1 ps-5 text-xs leading-6 text-text-2">
            <li>{t("rule.ime")}</li>
            <li>{t("rule.update")}</li>
            <li>{t("rule.move")}</li>
            <li>{t("rule.night")}</li>
          </ul>
          {status === "saved" && <p role="status" className="text-sm text-up">{t("saved")}</p>}
          {status === "pick" && <p role="alert" className="text-sm text-down">{t("addNone")}</p>}
          {status === "payments" && <p role="alert" className="text-sm text-down">{t("paymentsOff")}</p>}
          {status === "failed" && <p role="alert" className="text-sm text-down">{t("failed")}</p>}
        </div>
      )}
    </section>
  );
}

/** +98912… → 0912… (Persian digits in fa). */
function localPhone(e164: string, locale: Locale) {
  const local = e164.replace(/^\+98/, "0");
  return locale === "fa" ? local.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹".charAt(Number(d))) : local;
}
