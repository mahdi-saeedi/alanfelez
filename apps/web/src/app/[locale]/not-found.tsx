import { getLocale, getTranslations } from "next-intl/server";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";

/** Localized 404 (inside the site layout, so header, footer and tabs stay). */
export default async function NotFound() {
  const t = await getTranslations("error");
  const locale = (await getLocale()) as Locale;
  return (
    <section className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-gold">{formatNumber(404, locale)}</p>
      <h1 className="mt-4 text-2xl font-extrabold">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-text-2">{t("notFoundBody")}</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-gold px-6 py-2.5 font-bold text-graphite hover:bg-gold-light">{t("home")}</Link>
    </section>
  );
}
