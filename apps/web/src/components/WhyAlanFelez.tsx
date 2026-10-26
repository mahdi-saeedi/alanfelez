import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TierBadge } from "@/components/Locked";
import { signUp } from "@/lib/actions";

type Plan = "free" | "silver" | "gold";

// «چرا الان‌فلز؟» (client, 2026-10-26): what the site offers, each with its page and the plan that includes it
// (the plan table on /plans; access itself is decided by the API).
const BENEFITS: { key: string; href: string; plan: Plan; icon: React.ReactNode }[] = [
  { key: "prices", href: "/prices", plan: "free", icon: <path d="M4 19h16M7 16V9m5 7V5m5 11v-4" /> },
  { key: "floor", href: "/prices", plan: "silver", icon: <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /> },
  { key: "history", href: "/chart", plan: "silver", icon: <path d="M4 5v14h16M8 15l3-4 3 2 5-6" /> },
  { key: "charts", href: "/chart", plan: "free", icon: <path d="M4 18 9 12l4 3 7-9M4 18h16" /> },
  { key: "calculator", href: "/calculator", plan: "gold", icon: <path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 3h8v3H8zm0 6h2m3 0h3m-8 4h2m3 0h3" /> },
  { key: "analysis", href: "/analysis", plan: "gold", icon: <path d="M6 4h9l3 3v13H6zM9 10h6M9 14h6M9 18h3" /> },
  { key: "auctions", href: "/auctions", plan: "gold", icon: <path d="m14 5 5 5-3 3-5-5zm-1.5 4.5L5 17l2 2 7.5-7.5M4 21h9" /> },
];

/** The home page's «چرا الان‌فلز؟» section, after the plans. Signed-out visitors get a «شروع رایگان» button. */
export async function WhyAlanFelez({ locale, signedIn }: { locale: string; signedIn: boolean }) {
  const t = await getTranslations();
  return (
    <section className="py-12">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-2xl font-extrabold sm:text-3xl">{t("home.why.title")}</h2>
        <p className="mx-auto mt-3 max-w-3xl text-center leading-8 text-text-2">{t("home.why.subtitle")}</p>
        {/* Flex, not grid: a short last row (7 cards = 4 + 3) is centred instead of leaving a gap at the end. */}
        <ul className="mt-8 flex flex-wrap justify-center gap-4">
          {BENEFITS.map((b) => (
            <li key={b.key} className="w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-3rem)/4)]">
              <Link href={b.href} className="flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-soft transition hover:border-gold">
                <span className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold-dark">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
                      <g className="fill-none stroke-current [&>path]:fill-gold/20" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{b.icon}</g>
                    </svg>
                  </span>
                  <TierBadge plan={b.plan} label={t(`home.why.plan.${b.plan}`)} />
                </span>
                <span className="font-bold">{t(`home.why.items.${b.key}.title`)}</span>
                <span className="text-sm leading-7 text-text-2">{t(`home.why.items.${b.key}.text`)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {!signedIn && (
          <form action={signUp.bind(null, locale)} className="mt-8 text-center">
            <button className="rounded-lg bg-gold px-6 py-3 font-bold text-graphite hover:bg-gold-light">{t("home.why.cta")}</button>
          </form>
        )}
      </div>
    </section>
  );
}
