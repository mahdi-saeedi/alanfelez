import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSite } from "@/lib/content";
import { EnamadBadge } from "./EnamadBadge";
import type { Locale } from "@/lib/prices";

// The footer's link columns (client, 2026-10-27).
const QUICK = [
  ["prices", "/prices"],
  ["chart", "/chart"],
  ["analysis", "/analysis"],
  ["auctions", "/auctions"],
  ["calculator", "/calculator"],
] as const;
const COMPANY = [
  ["plans", "/plans"],
  ["about", "/about"],
  ["contact", "/contact"],
  ["faq", "/faq"],
] as const;

// Networks as set in the admin (Settings); only the ones with a URL are shown.
const NETWORKS = ["instagram", "telegram", "linkedin", "bale", "eitaa"] as const;
const ICONS: Partial<Record<(typeof NETWORKS)[number], React.ReactNode>> = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" className="fill-current" />
    </>
  ),
  telegram: <path d="m21 4-18 7 6 2 2 6 3-4 5 4zM9 13l9-6" />,
  linkedin: <path d="M4 9h3v11H4zM5.5 4.5v.01M10 20v-6a3 3 0 0 1 6 0v6m-6-11v11m6 0h3v-6a5 5 0 0 0-5-5" />,
};

/**
 * Site footer: about + social, quick links, company links, contact (from the admin's Settings; each line only when
 * set), the trust seal, and a bottom bar with the year, terms, privacy and the information-only notice.
 */
export async function Footer() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const site = await getSite(locale);
  const social = NETWORKS.filter((k) => site?.social[k]).map((k) => [k, site!.social[k]!] as const);
  const contact = site?.contact ?? {};
  const year = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-GB", { year: "numeric" }).format(new Date());
  const company = site?.licensesPage ? [...COMPANY, ["licenses", "/licenses"] as const] : COMPANY;
  const heading = "mb-3 text-sm font-bold text-white";
  const link = "hover:text-white";

  return (
    <footer className="mt-16 bg-graphite text-sm text-silver-light">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static logo */}
            <img src="/logo.png" alt="" width={48} height={48} className="h-12 w-12 rounded-lg" />
            <span className="text-xl font-extrabold">{t("brand.name")}</span>
          </Link>
          <p className="mt-4 max-w-sm leading-7">{t("footer.about")}</p>
          {social.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("footer.socialTitle")}>
              {social.map(([k, url]) => (
                <li key={k}>
                  <a href={url} rel="noopener noreferrer" target="_blank" aria-label={t(`footer.social.${k}`)}
                    className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-graphite-3 px-2.5 hover:border-gold hover:text-white">
                    {ICONS[k] ? (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                        <g className="fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</g>
                      </svg>
                    ) : (
                      t(`footer.social.${k}`)
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* On phones the two link columns sit side by side. */}
        <div className="grid grid-cols-2 gap-8 sm:contents">
          <nav aria-label={t("footer.quick")}>
            <h2 className={heading}>{t("footer.quick")}</h2>
            <ul className="space-y-2.5">
              {QUICK.map(([key, href]) => <li key={key}><Link href={href} className={link}>{t(`nav.${key}`)}</Link></li>)}
            </ul>
          </nav>
          <nav aria-label={t("footer.company")}>
            <h2 className={heading}>{t("footer.company")}</h2>
            <ul className="space-y-2.5">
              {company.map(([key, href]) => <li key={key}><Link href={href} className={link}>{t(`nav.${key}`)}</Link></li>)}
            </ul>
          </nav>
        </div>

        <div>
          <h2 className={heading}>{t("footer.contactTitle")}</h2>
          <ul className="space-y-2.5">
            {contact.phone && (
              <li>{t("footer.phone")}: <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className={`${link} tabular-nums`}>{contact.phone}</a></li>
            )}
            {contact.email && <li>{t("footer.email")}: <a href={`mailto:${contact.email}`} dir="ltr" className={link}>{contact.email}</a></li>}
            {contact.address && <li className="leading-7">{t("footer.address")}: {contact.address}</li>}
            {contact.hours && <li>{t("footer.hours")}: {contact.hours}</li>}
            <li>
              <Link href="/contact" className="inline-block rounded-lg border border-graphite-3 px-3 py-1.5 text-white hover:border-gold">{t("footer.contactForm")}</Link>
            </li>
          </ul>
          {site?.enamad && <EnamadBadge id={site.enamad.id} code={site.enamad.code} className="mt-5" />}
        </div>
      </div>

      <div className="border-t border-graphite-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span>{t("footer.rights", { year })}</span>
          <p className="text-silver-light/80">{t("footer.disclaimer")}</p>
          <nav aria-label={t("footer.legal")} className="flex gap-4">
            <Link href="/terms" className={link}>{t("nav.terms")}</Link>
            <Link href="/privacy" className={link}>{t("nav.privacy")}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
