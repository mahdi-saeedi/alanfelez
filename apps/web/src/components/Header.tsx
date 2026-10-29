import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { keycloak, PASSWORD_FIRST } from "@/lib/keycloak";
import { readSession } from "@/lib/session-refresh";
import { Link } from "@/i18n/navigation";
import { auth, signIn, signOut } from "@/auth";
import { LocaleSwitch } from "./LocaleSwitch";
import { getSite } from "@/lib/content";
import { accessToken } from "@/lib/api";
import { DesktopNav, MobileMenu } from "./MobileNav";
import { StickyHeader } from "./StickyHeader";
import { getEntitlements } from "@/lib/prices";
import { getMe } from "@/lib/account";
import { formatNumber } from "@alanfelez/ui/format";
import { AccountMenu } from "./AccountMenu";
import { RenewBanner } from "./RenewBanner";
import { RENEW_HIDE_COOKIE } from "./renew-cookie";

/** The renewal reminder shows when a paid plan ends within this many days (client, 2026-10-29). */
const RENEW_DAYS = 7;

/** Plan badge colors (CLAUDE.md: رایگان gray, نقره‌ای blue-gray, طلایی gold). */
const PLAN_BADGE = { free: "bg-graphite-3 text-silver-light", silver: "bg-silver-light text-graphite", gold: "bg-gold text-graphite" } as const;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}


export async function Header() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [session, site, token] = await Promise.all([auth(), getSite(locale as "fa" | "en"), accessToken()]);
  // Signed in to the website but without a working API token: the Keycloak session ended (another device took this
  // one's place under the device limit, or it expired). Every page then shows guest data, so say so and offer to sign in
  // again, instead of showing the user's name over a free-plan view.
  const expired = !!session?.user && !token;
  const signedIn = !!session?.user && !expired;
  const ent = signedIn ? await getEntitlements() : null;
  const tier = ent?.tier ?? "free";
  const renew = await renewReminder(ent?.tier, ent?.tierEndsAt);

  // «ورود»: username + password first; «ثبت‌نام»: mobile number + SMS code (see PASSWORD_FIRST).
  async function login() {
    "use server";
    (await cookies()).delete(RENEW_HIDE_COOKIE);
    await signIn("keycloak", undefined, { ...PASSWORD_FIRST, ui_locales: locale });
  }
  async function signup() {
    "use server";
    (await cookies()).delete(RENEW_HIDE_COOKIE);
    await signIn("keycloak", undefined, { ui_locales: locale });
  }
  // Ends the website session AND the Keycloak session (otherwise "login" would silently sign the same person back
  // in through SSO, which matters on shared computers).
  async function logout() {
    "use server";
    const session = await readSession(await headers()).catch(() => null);
    (await cookies()).delete(RENEW_HIDE_COOKIE);
    await signOut({ redirect: false });
    const url = new URL(`${keycloak.issuer}/protocol/openid-connect/logout`);
    url.searchParams.set("client_id", keycloak.clientId);
    url.searchParams.set("post_logout_redirect_uri", `${process.env.AUTH_URL ?? "http://localhost:3000"}${locale === "en" ? "/en" : "/"}`);
    if (session?.idToken) url.searchParams.set("id_token_hint", session.idToken);
    redirect(url.toString());
  }

  return (
    <StickyHeader>
      {/* Phone widths (360 px) are tight: logo, language switch, log in and sign up must fit on one row. */}
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-3 transition-[padding] group-data-[compact]:py-1.5 sm:gap-3 lg:gap-6">
        <MobileMenu />
        <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-extrabold text-white">
          <img src="/logo.png" alt="" width={84} height={84} className="h-14 w-14 rounded-lg transition-[width,height] group-data-[compact]:h-10 group-data-[compact]:w-10 sm:h-16 sm:w-16 lg:h-21 lg:w-21 lg:group-data-[compact]:h-12 lg:group-data-[compact]:w-12" />
          {/* The logo already shows the name; on phones the text would push the header wider than the screen. */}
          <span className="sr-only sm:not-sr-only">{t("brand.name")}</span>
        </Link>
        <DesktopNav />
        <div className="ms-auto flex items-center gap-1.5 sm:gap-2 lg:ms-0">
          <Link href="/search" aria-label={t("search.open")} title={t("search.open")} className="grid h-9 w-8 shrink-0 sm:w-9 place-items-center rounded-lg text-silver-light hover:bg-graphite-2 hover:text-white">
            <SearchIcon />
          </Link>
          {(site?.englishSite || locale === "en") && <LocaleSwitch label={t("locale.switch")} ariaLabel={t("locale.switchLabel")} />}
          {signedIn && session?.user ? (
            <div className="flex items-center gap-2">
              {/* Name and plan badge open the account menu (client, 2026-10-29); on phones the badge alone. */}
              <AccountMenu
                name={session.user.name || t("auth.account")}
                tier={t(`lock.plan.${tier}`)}
                badgeClass={PLAN_BADGE[tier]}
                logout={logout}
                labels={{ menu: t("auth.menu"), account: t("auth.myAccount"), plan: t("auth.myPlan"), tickets: t("auth.myTickets"), logout: t("auth.logout") }}
              />
              {tier === "free" && (
                <Link href="/plans" className="hidden whitespace-nowrap rounded-lg border border-gold px-3 py-1.5 text-sm font-bold text-gold-light hover:bg-gold hover:text-graphite sm:inline">
                  {t("auth.upgrade")}
                </Link>
              )}
            </div>
          ) : (
            <form action={login} className="flex items-center gap-2">
              <button className="whitespace-nowrap rounded-lg px-2 py-2 text-sm hover:bg-graphite-2 sm:px-3">{t("auth.login")}</button>
              {/* Sign-up is the phone + code page: a new number creates the account, then the sign-up form. */}
              <button formAction={signup} className="whitespace-nowrap rounded-lg bg-gold px-3 py-2 text-sm font-bold sm:px-4 text-graphite hover:bg-gold-light">
                {t("auth.signup")}
              </button>
            </form>
          )}
        </div>
      </div>
      {renew && (
        <RenewBanner
          text={renew.days <= 0 ? t("auth.renewToday", { plan: t(`lock.plan.${renew.plan}`) }) : t("auth.renewSoon", { plan: t(`lock.plan.${renew.plan}`), days: formatNumber(renew.days, locale as "fa" | "en") })}
          renew={t("auth.renewNow")}
          hide={t("auth.renewHide")}
          href={{ pathname: "/checkout", query: { plan: renew.plan, period: "month" } }}
        />
      )}
      {expired && (
        <div role="status" className="border-t border-graphite-3 bg-gold/15">
          <form action={login} className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-white">
            <span>{t("auth.expired")}</span>
            <button className="rounded-lg bg-gold px-4 py-1.5 text-sm font-bold text-graphite hover:bg-gold-light">{t("auth.loginAgain")}</button>
          </form>
        </div>
      )}
    </StickyHeader>
  );
}

/**
 * The renewal reminder's plan and days left, or null: a paid plan ending within RENEW_DAYS, with no renewal already
 * queued, and not hidden with × since the user signed in. Asks for the subscription details only when it's close.
 */
async function renewReminder(tier: string | undefined, endsAt: string | undefined) {
  if (!tier || tier === "free" || !endsAt) return null;
  const days = Math.ceil((Date.parse(endsAt) - Date.now()) / 86_400_000);
  if (days > RENEW_DAYS) return null;
  if ((await cookies()).get(RENEW_HIDE_COOKIE)) return null;
  const me = await getMe();
  if (!me?.current || me.next) return null;
  return { plan: me.current.plan, days };
}
