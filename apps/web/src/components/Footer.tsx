import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSite } from "@/lib/content";
import { EnamadBadge } from "./EnamadBadge";
import type { Locale } from "@/lib/prices";

const LINKS = [
  ["plans", "/plans"],
  ["analysis", "/analysis"],
  ["faq", "/faq"],
  ["about", "/about"],
  ["contact", "/contact"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
] as const;

const NETWORKS = ["telegram", "instagram", "linkedin", "bale", "eitaa"] as const;

export async function Footer() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const site = await getSite(locale);
  const social = NETWORKS.filter((k) => site?.social[k]).map((k) => [k, site!.social[k]] as const);
  return (
    <footer className="mt-16 bg-graphite text-silver-light">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm">
        <span>{t("footer.rights")}</span>
        <nav className="flex flex-wrap gap-4" aria-label="footer">
          {LINKS.map(([key, href]) => (
            <Link key={key} href={href} className="hover:text-white">
              {t(`nav.${key}`)}
            </Link>
          ))}
          {site?.licensesPage && (
            <Link href="/licenses" className="hover:text-white">{t("nav.licenses")}</Link>
          )}
        </nav>
        {social.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {social.map(([k, url]) => (
              <li key={k}>
                <a href={url} rel="noopener noreferrer" target="_blank" className="hover:text-white">{t(`footer.social.${k}`)}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Its own row under the links: when the seal shows up (or never does), nothing above it moves. */}
      {site?.enamad && <EnamadBadge id={site.enamad.id} code={site.enamad.code} className="mx-auto flex max-w-7xl justify-center px-4 pb-6" />}
    </footer>
  );
}
