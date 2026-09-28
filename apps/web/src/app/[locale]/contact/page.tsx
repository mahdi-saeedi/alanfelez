import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import { getSite } from "@/lib/content";
import { ContactForm } from "@/components/content/ContactForm";
import { sendContact } from "./actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale }> };

const SUBJECTS = ["general", "support", "billing", "partnership", "feedback", "other"] as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("title"), description: t("subtitle"), alternates: { languages: { fa: "/contact", en: "/en/contact" } } };
}

/**
 * Contact (SCOPE §5 #10, §12, design 15). Contact cards show only what's set in the admin (client answer #30).
 * The design's "report a listing / user" and API/enterprise blocks are left out (removed from v1, SCOPE §4).
 */
export default async function ContactPage({ params }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");
  const [site, session] = await Promise.all([getSite(locale), auth()]);
  const c = site?.contact ?? {};
  const cards: { key: string; title: string; value: string; href?: string; ltr?: boolean; icon: ReactNode }[] = [];
  if (c.phone) cards.push({ key: "phone", title: t("phoneCard"), value: c.phone, href: `tel:${c.phone}`, ltr: true, icon: <PhoneIcon /> });
  if (c.email) cards.push({ key: "email", title: t("emailCard"), value: c.email, href: `mailto:${c.email}`, ltr: true, icon: <MailIcon /> });
  if (c.address) cards.push({ key: "address", title: t("addressCard"), value: c.address, icon: <BuildingIcon /> });

  return (
    <>
      <section className="bg-hero px-4 py-12 text-center text-white">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-silver-light">{t("subtitle")}</p>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {cards.length > 0 && (
          <ul className="mb-8 grid gap-4 sm:grid-cols-3">
            {cards.map((card) => (
              <li key={card.key} className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-5 text-center shadow-soft">
                {card.icon}
                <span className="text-sm font-bold">{card.title}</span>
                {card.href ? (
                  <a href={card.href} dir={card.ltr ? "ltr" : undefined} className="text-sm text-text-2 hover:text-gold-dark">{card.value}</a>
                ) : (
                  <span className="text-sm text-text-2">{card.value}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <section className="rounded-card border border-border bg-surface p-5 shadow-soft sm:p-6">
            <h2 className="mb-4 font-extrabold">{t("formTitle")}</h2>
            <ContactForm
              action={sendContact}
              subjects={SUBJECTS.map((s) => ({ value: s, label: t(`subjects.${s}`) }))}
              labels={{
                name: t("name"), phone: t("phone"), email: t("email"), subject: t("subject"), message: t("message"),
                messagePlaceholder: t("messagePlaceholder"), choose: t("choose"), send: t("send"), sending: t("sending"),
                sent: t("sent"), invalid: t("invalid"), limited: t("limited"), failed: t("failed"),
              }}
            />
          </section>

          <aside className="space-y-4">
            {session?.user && (
              <section className="rounded-card border border-border bg-surface p-4 text-sm shadow-soft">
                <p className="text-text-2">{t("signedInHint")}</p>
                <Link href="/account#tickets" className="mt-3 inline-block font-bold text-gold-dark hover:underline">{t("ticketsLink")}</Link>
              </section>
            )}
            {c.hours && (
              <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
                <h2 className="mb-2 text-sm font-bold">{t("hours")}</h2>
                <p className="whitespace-pre-line text-sm text-text-2">{c.hours}</p>
              </section>
            )}
            <section className="rounded-card border border-border bg-surface p-4 text-center shadow-soft">
              <h2 className="text-sm font-bold">{t("faqTitle")}</h2>
              <p className="mt-1 text-xs text-text-2">{t("faqBody")}</p>
              <Link href="/faq" className="mt-3 inline-block rounded-lg border border-border px-4 py-1.5 text-sm hover:border-gold">{t("faqLink")}</Link>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

// Duotone icons in the brand colors (SCOPE §11).
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" className="fill-gold/30 stroke-gold" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7">
      <rect x="3" y="5" width="18" height="14" rx="2.5" className="fill-gold/30 stroke-gold" strokeWidth="1.6" />
      <path d="m4 7 8 6 8-6" className="fill-none stroke-gold" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7">
      <rect x="5" y="3" width="14" height="18" rx="1.5" className="fill-gold/30 stroke-gold" strokeWidth="1.6" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4" className="fill-none stroke-gold" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
