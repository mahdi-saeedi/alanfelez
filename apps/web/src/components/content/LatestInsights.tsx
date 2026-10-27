import { getTranslations } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getArticles } from "@/lib/content";
import { InsightCard } from "./InsightCard";

/**
 * Home: «تازه‌ترین تحلیل‌ها» (client, 2026-10-27), the three newest analyses and forecasts as on /analysis: title and
 * summary for everyone, the body stays Gold. Nothing when none is published. White like the auctions above it, with a
 * line between the two.
 */
export async function LatestInsights({ locale }: { locale: Locale }) {
  const list = await getArticles(locale, { type: ["analysis", "forecast"], limit: 3 });
  if (!list?.items.length) return null;
  const t = await getTranslations("analysis");
  return (
    <section className="border-t border-border bg-surface py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-extrabold sm:text-3xl">{t("latestTitle")}</h2>
          <Link href="/analysis" className="text-sm font-bold text-gold-dark hover:text-gold">{t("latestAll")}</Link>
        </div>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((a) => (
            <li key={a.slug} className="flex"><div className="flex w-full flex-col [&>article]:flex-1"><InsightCard a={a} locale={locale} /></div></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
