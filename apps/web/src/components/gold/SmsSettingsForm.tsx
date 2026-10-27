import { getTranslations } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import type { SmsSettings } from "@/lib/gold";
import { Locked } from "@/components/Locked";
import { saveSmsSettingsAction } from "@/app/[locale]/account/actions";

/**
 * Gold price SMS (client, 2026-10-27): the user picks one main metal; when its domestic and IME prices change they get
 * one «قیمت‌ها به‌روزرسانی شد» SMS (at most 3 a day, none at night), and an alert when a product moves 10 % or more
 * against the day before. On the account page and on the payment result page (`back`).
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
  return (
    <section id="sms" className="scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface shadow-soft">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold">{t("title")}</h2>
        <p className="mt-1 text-xs leading-6 text-text-2">{t("subtitle")}</p>
      </div>
      {!settings?.allowed ? (
        <div className="p-5"><Locked plan="gold">{t("locked", { plan: tl("plan.gold") })}</Locked></div>
      ) : (
        <form action={saveSmsSettingsAction} className="space-y-4 p-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="back" value={back} />
          {settings.phone ? (
            <p className="text-xs text-text-2">
              {t("phone")} <span dir="ltr" className="font-bold tabular-nums">{localPhone(settings.phone, locale)}</span>
            </p>
          ) : (
            <p role="alert" className="rounded-lg bg-down/10 p-3 text-sm text-down">{t("noPhone")}</p>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-bold">{t("metal")}</legend>
            <div className="flex flex-wrap gap-2">
              {metals.map((m) => (
                <label key={m.slug} className="cursor-pointer">
                  <input type="radio" name="metal" value={m.slug} defaultChecked={settings.metal === m.slug} required className="peer sr-only" />
                  <span className="inline-block rounded-full border border-border px-4 py-1.5 text-sm peer-checked:border-graphite peer-checked:bg-graphite peer-checked:font-bold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold">
                    {m.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
            {t("enabled")}
          </label>
          <ul className="list-disc space-y-1 ps-5 text-xs leading-6 text-text-2">
            <li>{t("rule.update")}</li>
            <li>{t("rule.move")}</li>
            <li>{t("rule.night")}</li>
          </ul>
          {status === "saved" && <p role="status" className="text-sm text-up">{t("saved")}</p>}
          {status === "failed" && <p role="alert" className="text-sm text-down">{t("failed")}</p>}
          <button className="rounded-lg bg-gold px-5 py-2 text-sm font-bold text-graphite hover:bg-gold-light">{t("save")}</button>
        </form>
      )}
    </section>
  );
}

/** +98912… → 0912… (Persian digits in fa). */
function localPhone(e164: string, locale: Locale) {
  const local = e164.replace(/^\+98/, "0");
  return locale === "fa" ? local.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹".charAt(Number(d))) : local;
}
