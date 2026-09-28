import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Placeholder routes for sections built in later milestones (M2–M5). Unknown slugs → 404.
const SECTIONS = ["analysis", "auctions", "calculator", "faq", "about", "contact", "terms", "privacy"] as const;
type Section = (typeof SECTIONS)[number];

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}
export const dynamicParams = false;

export default async function SectionPlaceholder({ params }: { params: Promise<{ locale: string; section: string }> }) {
  const { locale, section } = await params;
  if (!SECTIONS.includes(section as Section)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-3xl font-extrabold">{t(`nav.${section as Section}`)}</h1>
      <p className="mt-4 text-text-2">{t("placeholder.body")}</p>
    </section>
  );
}
