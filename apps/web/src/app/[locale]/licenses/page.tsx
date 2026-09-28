import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { StaticPage, pageMetadata } from "@/components/content/StaticPage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return pageMetadata((await params).locale, "licenses");
}

/** Licenses & trust (SCOPE §5 #13): a 404 until the flag page.licenses is on (the API decides). */
export default async function LicensesPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StaticPage locale={locale} slug="licenses" />;
}
