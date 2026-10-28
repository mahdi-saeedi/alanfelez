import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { seo } from "@/lib/seo";
import { search } from "@/lib/search";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  // Result pages are endless and thin: not for search engines (and not in the sitemap).
  return seo(locale, "/search", { title: t("title"), noindex: true });
}

/** Site search (client, 2026-10-28), opened from the header's magnifier. Works without JavaScript (a GET form). */
export default async function SearchPage({ params, searchParams }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("search");
  const tn = await getTranslations("nav");
  const q = ((await searchParams).q ?? "").slice(0, 80).trim();
  const r = q.length >= 2 ? await search(locale, q, (k) => tn(k)) : null;
  const total = r ? r.products.length + r.metals.length + r.articles.length + r.faq.length + r.pages.length : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="mb-4 text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
      <form action={locale === "en" ? "/en/search" : "/search"} role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="q">{t("label")}</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          autoFocus={!q}
          minLength={2}
          maxLength={80}
          placeholder={t("placeholder")}
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-4 py-3 text-base"
        />
        <button className="shrink-0 rounded-control bg-graphite px-5 text-sm font-bold text-white hover:bg-graphite-2">{t("submit")}</button>
      </form>

      {r && (
        <p className="mt-4 text-sm text-text-2" role="status">
          {total ? t("count", { count: total, n: formatNumber(total, locale), q }) : t("none", { q })}
        </p>
      )}

      {r && total > 0 && (
        <div className="mt-6 space-y-6">
          <Group title={t("products")} n={r.products.length}>
            {r.products.map((s) => (
              <Item key={s.slug} href={{ pathname: "/chart", query: { series: s.slug } }} title={s.product.name} sub={`${s.metal.name} · ${s.category.name} · ${s.market.name}`} />
            ))}
          </Group>
          <Group title={t("metals")} n={r.metals.length}>
            {r.metals.map((m) => <Item key={m.slug} href={`/prices/${m.slug}`} title={t("metalPrices", { metal: m.name })} />)}
          </Group>
          <Group title={t("articles")} n={r.articles.length}>
            {r.articles.map((a) => <Item key={a.slug} href={`/analysis/${a.slug}`} title={a.title} sub={a.summary} />)}
          </Group>
          <Group title={t("faq")} n={r.faq.length}>
            {r.faq.map((i) => <Item key={i.slug} href={`/faq#${i.slug}`} title={i.question} />)}
          </Group>
          <Group title={t("pages")} n={r.pages.length}>
            {r.pages.map(([key, href]) => <Item key={key} href={href} title={tn(key)} />)}
          </Group>
        </div>
      )}
      {r && total === 0 && (
        <p className="mt-6 text-sm text-text-2">
          {t("tryOther")} <Link href="/prices" className="font-bold text-gold-dark hover:underline">{tn("prices")}</Link>
        </p>
      )}
    </div>
  );
}

function Group({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  if (!n) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-text-2">{title}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-soft">{children}</ul>
    </section>
  );
}

function Item({ href, title, sub }: { href: string | { pathname: string; query: Record<string, string> }; title: string; sub?: string }) {
  return (
    <li>
      <Link href={href} className="block px-4 py-3 hover:bg-surface-2">
        <span className="font-bold">{title}</span>
        {sub && <span className="mt-0.5 line-clamp-2 block text-xs text-text-2">{sub}</span>}
      </Link>
    </li>
  );
}
