import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { signUp } from "@/lib/actions";

/**
 * The home page's closing call to action (client, 2026-10-26), after the latest auctions: a dark card in the hero's
 * colours with a faint rising line. Signed-out visitors get «شروع رایگان» (sign-up) and the plans; signed-in users the
 * plans and the prices.
 */
export async function FinalCta({ locale, signedIn }: { locale: string; signedIn: boolean }) {
  const t = await getTranslations("home.finalCta");
  return (
    <section className="px-4 py-12">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-card bg-gradient-to-br from-graphite to-hero px-6 py-12 text-center text-white shadow-card sm:px-12 sm:py-16">
        {/* Decoration only: a gold glow and a rising price line behind the text. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
        <svg aria-hidden viewBox="0 0 600 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-30">
          <path d="M0 105 L60 98 L120 102 L180 84 L240 90 L300 66 L360 72 L420 48 L480 54 L540 30 L600 22" className="fill-none stroke-gold" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M0 105 L60 98 L120 102 L180 84 L240 90 L300 66 L360 72 L420 48 L480 54 L540 30 L600 22 L600 120 L0 120 Z" className="fill-gold/10" />
        </svg>
        <div className="relative">
          <span className="text-sm font-bold text-gold-light">{t("eyebrow")}</span>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">{t("title")}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-silver-light">{t("text")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {signedIn ? (
              <Link href="/prices" className="rounded-lg bg-gold px-6 py-3 font-bold text-graphite hover:bg-gold-light">{t("prices")}</Link>
            ) : (
              <form action={signUp.bind(null, locale)}>
                <button className="rounded-lg bg-gold px-6 py-3 font-bold text-graphite hover:bg-gold-light">{t("start")}</button>
              </form>
            )}
            <Link href="/plans" className="rounded-lg border border-graphite-3 px-6 py-3 font-bold text-white hover:border-gold">{t("plans")}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
