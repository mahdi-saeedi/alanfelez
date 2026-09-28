import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getMetals } from "@/lib/content";
import { StaticPage, pageMetadata } from "@/components/content/StaticPage";
import { metalTone } from "@/components/content/parts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return pageMetadata((await params).locale, "about");
}

/** About (SCOPE §5 #9, design 14): the CMS text from درباره ما.docx, the metals we cover, and the CTAs (SCOPE §11). */
export default async function AboutPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages");
  const metals = await getMetals(locale);
  return (
    <StaticPage locale={locale} slug="about">
      {metals.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-extrabold">{t("markets")}</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
            {metals.map((m) => (
              <li key={m.slug}>
                <Link href={{ pathname: "/prices", query: { metal: m.slug } }} className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-3 text-sm font-bold shadow-soft hover:border-gold">
                  <span className="h-5 w-5 rounded-full shadow-inner" style={{ backgroundColor: metalTone(m.slug) }} aria-hidden />
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/prices" className="rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-graphite hover:bg-gold-light">{t("ctaPrices")}</Link>
        <Link href="/chart" className="rounded-lg bg-graphite px-5 py-2.5 text-sm font-bold text-white hover:bg-graphite-2">{t("ctaChart")}</Link>
        <Link href="/plans" className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-bold hover:border-gold">{t("ctaPlans")}</Link>
      </div>
    </StaticPage>
  );
}
