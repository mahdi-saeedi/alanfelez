import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber, type Locale } from "@alanfelez/ui/format";
import type { Schemas } from "@alanfelez/api-client";
import { Link } from "@/i18n/navigation";
import { getAuctions } from "@/lib/gold";
import { getMetals } from "@/lib/content";
import { LockIcon } from "@/components/Locked";
import { AuctionCard } from "@/components/auctions/AuctionCard";

export const dynamic = "force-dynamic";

const CATEGORIES = ["intermediate", "scrap", "raw"] as const satisfies readonly Schemas["AuctionCategory"][];
const STATUSES = ["open", "paused", "closed"] as const satisfies readonly Schemas["AuctionStatus"][];
const PAGE = 24;

type Query = { metal?: string; category?: string; status?: string; page?: string };
type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<Query> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auctions" });
  return seo(locale, "/auctions", { title: t("title"), description: t("subtitle") });
}

/**
 * Metal auctions («مزایدات», client 2026-10-26): ingots and intermediate products, scrap, raw materials. Everyone sees
 * each auction's title, metal, category, quantity and status; the deadline, place, organiser, details and PDF are
 * Gold. The API leaves the locked fields out, so there's nothing hidden in the page to reveal.
 */
export default async function AuctionsPage({ params, searchParams }: Params) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auctions");
  const tl = await getTranslations("lock");
  const category = CATEGORIES.find((c) => c === sp.category);
  const status = STATUSES.find((s) => s === sp.status);
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const [list, all, metals] = await Promise.all([
    getAuctions(locale, { metal: sp.metal, category, status, limit: PAGE, offset: (page - 1) * PAGE }),
    // Every auction (titles only): which metals to offer and how many there are of each status.
    getAuctions(locale, { limit: 100 }),
    getMetals(locale),
  ]);
  if (!list) return <p className="mx-auto max-w-7xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  const plan = list.requiredPlan ?? "gold";
  const usedMetals = new Set((all?.items ?? []).map((a) => a.metal.slug));
  const count = (s: string) => (all?.items ?? []).filter((a) => a.status === s).length;
  const current = { metal: sp.metal, category, status };
  const href = (patch: Partial<typeof current> & { page?: number }) => ({
    pathname: "/auctions" as const,
    query: Object.fromEntries(
      Object.entries({ ...current, ...patch, page: patch.page && patch.page > 1 ? String(patch.page) : undefined }).filter((e): e is [string, string] => !!e[1]),
    ),
  });
  const chip = (on: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface text-text-2 hover:border-gold"}`;
  const filters = [
    { label: t("filter.metal"), items: [{ v: undefined, name: t("all") }, ...metals.filter((m) => usedMetals.has(m.slug) || m.slug === sp.metal).map((m) => ({ v: m.slug, name: m.name }))], key: "metal" as const },
    { label: t("filter.category"), items: [{ v: undefined, name: t("all") }, ...CATEGORIES.map((c) => ({ v: c, name: t(`category.${c}`) }))], key: "category" as const },
    { label: t("filter.status"), items: [{ v: undefined, name: t("all") }, ...STATUSES.map((s) => ({ v: s, name: `${t(`status.${s}`)} (${formatNumber(count(s), locale)})` }))], key: "status" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-text-2">{t("subtitle")}</p>
      </header>

      <div className="mb-6 space-y-3">
        {filters.map((f) => (
          // One sideways-scrolling line per filter on phones (they took six lines), wrapped from sm up.
          <nav key={f.key} aria-label={f.label} className="-mx-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            <span className="me-1 shrink-0 text-sm font-bold text-text-2">{f.label}:</span>
            {f.items.map((it) => (
              <Link key={it.v ?? "all"} href={href({ [f.key]: it.v, page: 1 })} aria-current={current[f.key] === it.v ? "page" : undefined} className={`shrink-0 ${chip(current[f.key] === it.v)}`}>
                {it.name}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      {/* One short line instead of a big box: the cards already say what's locked (client, 2026-10-31). */}
      {list.locked && (
        <Link href="/plans" className="mb-6 flex items-center gap-3 rounded-card border border-gold/50 bg-gold/10 p-3 text-sm hover:border-gold">
          <LockIcon className="h-5 w-5 shrink-0 text-gold-dark" />
          <span className="flex-1">{t("lockedBanner", { plan: tl(`plan.${plan}`) })}</span>
          <span className="shrink-0 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-graphite">{t("lockedCta", { plan: tl(`plan.${plan}`) })}</span>
        </Link>
      )}

      {list.items.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-8 text-center text-text-2">{t("empty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.items.map((a) => (
            <li key={a.id}><AuctionCard a={a} locale={locale} locked={list.locked} /></li>
          ))}
        </ul>
      )}

      {list.total > PAGE && (
        <nav aria-label={t("pages")} className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={href({ page: page - 1 })} className={chip(false)}>{t("prev")}</Link>}
          {page * PAGE < list.total && <Link href={href({ page: page + 1 })} className={chip(false)}>{t("next")}</Link>}
        </nav>
      )}
      <p className="mt-6 text-xs text-text-3">{t("info")}</p>
    </div>
  );
}
