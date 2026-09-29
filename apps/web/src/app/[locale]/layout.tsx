import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomTabs } from "@/components/MobileNav";
import { LivePricesProvider } from "@/components/prices/LivePrices";
import { PriceTicker } from "@/components/prices/PriceTicker";
import { getBasePrices } from "@/lib/prices";
import { INDEXABLE, SITE_URL, alternatesFor, englishEnabled } from "@/lib/site";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  const english = await englishEnabled();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("brand.name"), template: `%s | ${t("brand.name")}` },
    description: t("brand.tagline"),
    applicationName: t("brand.name"),
    alternates: alternatesFor(locale, "/", english),
    openGraph: { siteName: t("brand.name"), locale: locale === "fa" ? "fa_IR" : "en_US", type: "website", images: [{ url: "/logo.png", width: 215, height: 215 }] },
    twitter: { card: "summary" },
    icons: { icon: "/logo.png", apple: "/logo.png" },
    // Only production is indexed (SITE_INDEXABLE); staging and local demos never show up in search.
    ...(INDEXABLE ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  // Base prices feed the ticker and the live provider on every page; pages with paid rows fetch those themselves.
  const prices = await getBasePrices(locale as "fa" | "en");
  const rows = prices?.items ?? [];

  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"}>
      <body className="flex min-h-screen flex-col pb-16 lg:pb-0">
        <NextIntlClientProvider>
          <LivePricesProvider initial={rows}>
            <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:font-bold focus:text-graphite">
              {t("nav.skip")}
            </a>
            <PriceTicker rows={rows} />
            <Header />
            <main id="main" className="flex-1">{children}</main>
            <Footer />
            <BottomTabs />
          </LivePricesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
