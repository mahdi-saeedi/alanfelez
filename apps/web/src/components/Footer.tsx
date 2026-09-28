import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const LINKS = [
  ["plans", "/plans"],
  ["faq", "/faq"],
  ["about", "/about"],
  ["contact", "/contact"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
] as const;

export async function Footer() {
  const t = await getTranslations();
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
        </nav>
      </div>
    </footer>
  );
}
