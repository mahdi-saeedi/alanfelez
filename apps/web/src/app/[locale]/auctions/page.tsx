import type { Metadata } from "next";
import { seo } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import type { Schemas } from "@alanfelez/api-client";
import { Link } from "@/i18n/navigation";
import { getAuctions } from "@/lib/gold";
import { getMetals } from "@/lib/content";
import { Locked } from "@/components/Locked";
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
  const [list, metals] = await Promise.all([
    getAuctions(locale, { metal: sp.metal, category, status, limit: PAGE, offset: (page - 1) * PAGE }),
    getMetals(locale),
  ]);
  if (!list) return <p className="mx-auto max-w-7xl px-4 py-16 text-down">{(await getTranslations())("error.apiDown")}</p>;
  const plan = list.requiredPlan ?? "gold";
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
    { label: t("filter.metal"), items: [{ v: undefined, name: t("all") }, ...metals.map((m) => ({ v: m.slug, name: m.name }))], key: "metal" as const },
    { label: t("filter.category"), items: [{ v: undefined, name: t("all") }, ...CATEGORIES.map((c) => ({ v: c, name: t(`category.${c}`) }))], key: "category" as const },
    { label: t("filter.status"), items: [{ v: undefined, name: t("all") }, ...STATUSES.map((s) => ({ v: s, name: t(`status.${s}`) }))], key: "status" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-text-2">{t("subtitle")}</p>
      </header>

      <div className="mb-6 space-y-3">
        {filters.map((f) => (
          <nav key={f.key} aria-label={f.label} className="flex flex-wrap items-center gap-2">
            <span className="me-1 text-sm font-bold text-text-2">{f.label}:</span>
            {f.items.map((it) => (
              <Link key={it.v ?? "all"} href={href({ [f.key]: it.v, page: 1 })} aria-current={current[f.key] === it.v ? "page" : undefined} className={chip(current[f.key] === it.v)}>
                {it.name}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      {list.locked && (
        <div className="mb-6">
          <Locked plan={plan} title={t("lockedTitle", { plan: tl(`plan.${plan}`) })}>
            {t("lockedBody", { plan: tl(`plan.${plan}`) })}
          </Locked>
        </div>
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
