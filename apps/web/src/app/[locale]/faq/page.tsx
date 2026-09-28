import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getFaq } from "@/lib/content";
import { FaqBrowser } from "@/components/content/FaqBrowser";

type Params = { params: Promise<{ locale: Locale }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faq" });
  return { title: t("title"), description: t("subtitle"), alternates: { languages: { fa: "/faq", en: "/en/faq" } } };
}

/** FAQ (SCOPE §5 #8, design 13, requirements in FAQ.docx / CLAUDE.md). Content from the CMS. */
export default async function FaqPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("faq");
  const categories = await getFaq(locale);
  if (!categories) {
    return <p className="mx-auto max-w-3xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  }

  // FAQPage schema with exactly the questions rendered on this page (all published ones).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: categories.flatMap((c) =>
      c.items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
    ),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-sm text-text-2">{t("subtitle")}</p>
      </header>

      <FaqBrowser
        categories={categories}
        labels={{
          search: t("search"), searchLabel: t("searchLabel"), all: t("all"), popular: t("popular"),
          noResults: t("noResults"), copyLink: t("copyLink"), copied: t("copied"),
        }}
      />

      <section className="mt-12 rounded-card bg-graphite px-6 py-8 text-center text-white">
        <SupportIcon />
        <h2 className="mt-3 text-lg font-extrabold">{t("ctaTitle")}</h2>
        <p className="mt-2 text-sm text-silver-light">{t("ctaBody")}</p>
        <Link href="/contact" className="mt-5 inline-block rounded-lg bg-gold px-6 py-2.5 text-sm font-bold text-graphite hover:bg-gold-light">
          {t("ctaButton")}
        </Link>
      </section>
    </div>
  );
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mx-auto h-8 w-8">
      <path d="M4 14v-2a8 8 0 1 1 16 0v2" className="fill-none stroke-silver-light" strokeWidth="2" strokeLinecap="round" />
      <rect x="3" y="13" width="4" height="6" rx="1.5" className="fill-gold/40 stroke-gold" strokeWidth="1.5" />
      <rect x="17" y="13" width="4" height="6" rx="1.5" className="fill-gold/40 stroke-gold" strokeWidth="1.5" />
    </svg>
  );
}
