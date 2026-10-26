import { getTranslations } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getAuctions } from "@/lib/gold";
import { AuctionCard } from "./AuctionCard";

/** Home: «تازه‌ترین مزایدات» after «چرا الان‌فلز؟» (client, 2026-10-26), the three newest auctions; nothing when none. */
export async function LatestAuctions({ locale }: { locale: Locale }) {
  const list = await getAuctions(locale, { limit: 3 });
  if (!list?.items.length) return null;
  const t = await getTranslations("auctions");
  return (
    <section className="bg-surface py-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-extrabold sm:text-3xl">{t("latestTitle")}</h2>
          <Link href="/auctions" className="text-sm font-bold text-gold-dark hover:text-gold">{t("latestAll")}</Link>
        </div>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((a) => (
            <li key={a.id}><AuctionCard a={a} locale={locale} locked={list.locked} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
