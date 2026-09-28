import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LivePricesProvider } from "@/components/prices/LivePrices";
import { PriceTicker } from "@/components/prices/PriceTicker";
import { getBasePrices } from "@/lib/prices";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: { default: t("brand.name"), template: `%s | ${t("brand.name")}` },
    description: t("brand.tagline"),
    alternates: { languages: { fa: "/", en: "/en" } },
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Base prices feed the ticker and the live provider on every page; pages with paid rows fetch those themselves.
  const prices = await getBasePrices(locale as "fa" | "en");
  const rows = prices?.items ?? [];

  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <LivePricesProvider initial={rows}>
            <PriceTicker rows={rows} />
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </LivePricesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
