import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { seo } from "@/lib/seo";
import { search, type SearchItem, type SearchKind } from "@/lib/search";
import { SearchBox } from "@/components/SearchBox";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ q?: string }> };

const KINDS: SearchKind[] = ["products", "metals", "articles", "faq", "pages"];

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
  const r = q.length >= 2 ? await search(locale, q, { page: (k) => tn(k), metalPrices: (metal) => t("metalPrices", { metal }) }) : null;
  const total = r?.items.length ?? 0;
  const kinds = Object.fromEntries(KINDS.map((k) => [k, t(k)]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="mb-4 text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
      <SearchBox key={q} q={q} labels={{ label: t("label"), placeholder: t("placeholder"), submit: t("submit"), similar: t("similarHint"), kinds }} />

      {r && (
        <p className="mt-4 text-sm text-text-2" role="status">
          {!total ? t("none", { q }) : r.similar ? t("similar", { q }) : t("count", { count: total, n: formatNumber(total, locale), q })}
        </p>
      )}

      {r && total > 0 && (
        <div className="mt-6 space-y-6">
          {KINDS.map((k) => (
            <Group key={k} title={t(k)} items={r.items.filter((i) => i.kind === k)} />
          ))}
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

function Group({ title, items }: { title: string; items: SearchItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-text-2">{title}</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-soft">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="block px-4 py-3 hover:bg-surface-2">
              <span className="font-bold">{it.title}</span>
              {it.sub && <span className="mt-0.5 line-clamp-2 block text-xs text-text-2">{it.sub}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
