import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { getPage, getSite, type SiteInfo } from "@/lib/content";
import { RichText } from "./parts";

export type PageSlug = "about" | "terms" | "privacy" | "licenses";

export async function pageMetadata(locale: Locale, slug: PageSlug): Promise<Metadata> {
  const p = await getPage(locale, slug);
  if (!p) return {};
  return { title: p.title, alternates: { languages: { fa: `/${slug}`, en: `/en/${slug}` } } };
}

/**
 * A CMS page (about, terms, privacy, licenses): title, "last updated" (the page's save time, so it can't be forgotten),
 * the body, and optional blocks around it. Unpublished pages are 404s.
 */
export async function StaticPage({ locale, slug, withContact = false, children }: { locale: Locale; slug: PageSlug; withContact?: boolean; children?: ReactNode }) {
  const t = await getTranslations();
  const [page, site] = await Promise.all([getPage(locale, slug), withContact ? getSite(locale) : null]);
  if (page === null) notFound();
  if (!page) return <p className="mx-auto max-w-3xl px-4 py-16 text-down">{t("error.apiDown")}</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold leading-10 sm:text-3xl">{page.title}</h1>
        {slug !== "about" && <p className="mt-2 text-xs text-text-3">{t("pages.updated", { date: formatDate(page.updatedAt, locale) })}</p>}
      </header>
      <div className="rounded-card border border-border bg-surface p-5 shadow-soft sm:p-8">
        <RichText html={page.body} />
      </div>
      {withContact && site && <ContactBlock site={site} />}
      {children}
    </div>
  );
}

/** Contact details from the site settings, only the ones that are filled in (client answer #30). */
export async function ContactBlock({ site }: { site: SiteInfo }) {
  const t = await getTranslations("pages");
  const c = site.contact;
  const rows = [
    ["phone", c.phone, true],
    ["email", c.email, true],
    ["address", c.address, false],
    ["hours", c.hours, false],
  ] as const;
  const shown = rows.filter(([, v]) => !!v);
  if (shown.length === 0) return null;
  return (
    <section className="mt-6 rounded-card border border-border bg-surface p-5 shadow-soft">
      <h2 className="mb-3 font-bold">{t("contactTitle")}</h2>
      <dl className="space-y-2 text-sm">
        {shown.map(([k, v, ltr]) => (
          <div key={k} className="flex flex-wrap justify-between gap-2">
            <dt className="text-text-2">{t(k)}</dt>
            <dd dir={ltr ? "ltr" : undefined}>
              {k === "email" ? <a href={`mailto:${v}`} className="hover:text-gold-dark">{v}</a> : k === "phone" ? <a href={`tel:${v}`} className="hover:text-gold-dark">{v}</a> : v}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
