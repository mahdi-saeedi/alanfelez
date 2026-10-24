import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { StaticPage, pageMetadata } from "@/components/content/StaticPage";
import { EnamadBadge } from "@/components/EnamadBadge";
import { getSite } from "@/lib/content";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return pageMetadata((await params).locale, "licenses");
}

/** Licenses & trust (SCOPE §5 #13): a 404 until the flag page.licenses is on (the API decides). */
export default async function LicensesPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const site = await getSite(locale);
  return (
    <StaticPage locale={locale} slug="licenses">
      {site?.enamad && <EnamadBadge id={site.enamad.id} code={site.enamad.code} className="mx-auto mt-6 max-w-3xl px-4" />}
    </StaticPage>
  );
}
