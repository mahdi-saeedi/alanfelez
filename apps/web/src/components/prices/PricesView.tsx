import { getTranslations } from "next-intl/server";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { getPrices } from "@/lib/prices";
import { PriceTable } from "@/components/prices/PriceTable";
import { Movers } from "@/components/prices/Movers";
import { LiveDot } from "@/components/prices/LiveDot";
import { LockIcon } from "@/components/Locked";

/**
 * Metal prices (SCOPE §5 #2, design 07-metal-prices): /prices (every metal) and /prices/<metal> (one metal, its own
 * address and title for search engines, client 2026-10-27; same look). Filters are links, so it works without JS.
 */
export async function PricesView({ locale, metal, category, title, subtitle }: { locale: Locale; metal?: string; category?: string; title: string; subtitle: string }) {
  const t = await getTranslations("prices");
  const tl = await getTranslations("lock");

  const lang = { params: { header: { "Accept-Language": locale } }, next: { revalidate: 300 } } as const;
  const [all, filtered, markets, cats] = await Promise.all([
    getPrices(locale),
    getPrices(locale, metal, category),
    api.GET("/v1/markets", lang),
    api.GET("/v1/categories", lang),
  ]);
  if (!all || !filtered) {
    return <p className="mx-auto max-w-7xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  }

  // Tabs from what the caller can see (names come localized from the API).
  const metals = unique(all.items.map((r) => r.series.metal));
  const categories: Tab[] = cats.data?.items ?? unique(all.items.map((r) => r.series.category));
  const rows = filtered.items;
  const latest = rows.map((r) => r.observedAt).filter(Boolean).sort().at(-1);
  // A metal is part of the path (/prices/copper); the category stays a query parameter.
  const href = (q: { metal?: string; category?: string }) => {
    const m = "metal" in q ? q.metal : metal;
    return { pathname: m ? `/prices/${m}` : "/prices", query: clean({ category, ...q, metal: undefined }) };
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          <LiveDot withLabel />
        </div>
        <p className="mt-2 text-text-2">{subtitle}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Tabs
              items={[{ slug: undefined, name: t("all") }, ...metals]}
              active={metal}
              link={(slug) => href({ metal: slug })}
            />
            <Tabs
              items={[{ slug: undefined, name: t("all") }, ...categories]}
              active={category}
              link={(slug) => href({ category: slug })}
            />
          </div>

          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-soft">
            {rows.length ? <PriceTable rows={rows} /> : <p className="p-8 text-center text-text-2">{t("empty")}</p>}
            {filtered.lockedCount > 0 && filtered.lockedFeature && (
              <Link href="/plans" className="flex items-center gap-3 border-t border-border bg-gold/5 px-4 py-3 text-sm hover:bg-gold/10">
                <LockIcon className="h-5 w-5 shrink-0" />
                <span className="flex-1">
                  {t("lockedRows", { count: filtered.lockedCount, plan: tl(`plan.${filtered.lockedFeature.requiredPlan}`) })}
                </span>
                <span className="font-bold text-gold-dark">{tl("upgrade", { plan: tl(`plan.${filtered.lockedFeature.requiredPlan}`) })}</span>
              </Link>
            )}
            <div className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3 text-xs text-text-3">
              <span>{t("showing", { shown: rows.length, total: rows.length + filtered.lockedCount })}</span>
              {latest && <span>{t("lastUpdate", { time: formatDate(latest, locale, true) })}</span>}
            </div>
          </div>
          <p className="text-xs text-text-3">{t("info")}</p>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface p-5 shadow-soft">
            <div>
              <h2 className="font-bold">{t("historyTitle")}</h2>
              <p className="mt-1 text-sm text-text-2">{t("historySub")}</p>
            </div>
            <Link href="/chart" className="rounded-lg bg-graphite px-5 py-2.5 text-sm font-bold text-white hover:bg-graphite-2">
              {t("historyCta")}
            </Link>
          </div>
        </div>

        <aside className="space-y-4">
          <Movers rows={all.items} />
          <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
            <h2 className="mb-2 text-sm font-bold">{t("sources")}</h2>
            <ul className="space-y-1.5 text-sm text-text-2">
              {markets.data?.items
                .filter((m) => m.scope === "domestic")
                .map((m) => (
                  <li key={m.slug} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
                    {m.name}
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

type Tab = { slug?: string; name: string };

function Tabs({ items, active, link }: { items: Tab[]; active?: string; link: (slug?: string) => { pathname: string; query: Record<string, string> } }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-control border border-border bg-surface p-1">
      {items.map((it) => {
        const on = it.slug === active;
        return (
          <Link
            key={it.slug ?? "all"}
            href={link(it.slug)}
            aria-current={on ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${on ? "bg-graphite font-bold text-white" : "text-text-2 hover:bg-surface-2"}`}
          >
            {it.name}
          </Link>
        );
      })}
    </nav>
  );
}

function unique(list: { slug: string; name: string }[]): Tab[] {
  const seen = new Map<string, Tab>();
  for (const x of list) if (!seen.has(x.slug)) seen.set(x.slug, { slug: x.slug, name: x.name });
  return [...seen.values()];
}

function clean(q: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(q).filter((e): e is [string, string] => !!e[1]));
}
