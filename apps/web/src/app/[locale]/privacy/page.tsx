import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { StaticPage, pageMetadata } from "@/components/content/StaticPage";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return pageMetadata((await params).locale, "privacy");
}

export default async function PrivacyPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StaticPage locale={locale} slug="privacy" withContact />;
}
