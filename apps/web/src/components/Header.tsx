import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { keycloak, PASSWORD_FIRST } from "@/lib/keycloak";
import { readSession } from "@/lib/session-refresh";
import { Link } from "@/i18n/navigation";
import { auth, signIn, signOut } from "@/auth";
import { LocaleSwitch } from "./LocaleSwitch";
import { MAIN_NAV } from "@/lib/nav";
import { getSite } from "@/lib/content";
import { accessToken } from "@/lib/api";
import { MobileMenu } from "./MobileNav";


export async function Header() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [session, site, token] = await Promise.all([auth(), getSite(locale as "fa" | "en"), accessToken()]);
  // Signed in to the website but without a working API token: the Keycloak session ended (another device took this
  // one's place under the device limit, or it expired). Every page then shows guest data, so say so and offer to sign in
  // again, instead of showing the user's name over a free-plan view.
  const expired = !!session?.user && !token;
  const signedIn = !!session?.user && !expired;

  // «ورود»: username + password first; «ثبت‌نام»: mobile number + SMS code (see PASSWORD_FIRST).
  async function login() {
    "use server";
    await signIn("keycloak", undefined, { ...PASSWORD_FIRST, ui_locales: locale });
  }
  async function signup() {
    "use server";
    await signIn("keycloak", undefined, { ui_locales: locale });
  }
  // Ends the website session AND the Keycloak session (otherwise "login" would silently sign the same person back
  // in through SSO, which matters on shared computers).
  async function logout() {
    "use server";
    const session = await readSession(await headers()).catch(() => null);
    await signOut({ redirect: false });
    const url = new URL(`${keycloak.issuer}/protocol/openid-connect/logout`);
    url.searchParams.set("client_id", keycloak.clientId);
    url.searchParams.set("post_logout_redirect_uri", `${process.env.AUTH_URL ?? "http://localhost:3000"}${locale === "en" ? "/en" : "/"}`);
    if (session?.idToken) url.searchParams.set("id_token_hint", session.idToken);
    redirect(url.toString());
  }

  return (
    <header className="bg-graphite text-white">
      {/* Phone widths (360 px) are tight: logo, language switch, log in and sign up must fit on one row. */}
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3 lg:gap-6">
        <MobileMenu />
        <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-extrabold text-white">
          <img src="/logo.png" alt="" width={84} height={84} className="h-14 w-14 rounded-lg sm:h-16 sm:w-16 lg:h-21 lg:w-21" />
          {/* The logo already shows the name; on phones the text would push the header wider than the screen. */}
          <span className="sr-only sm:not-sr-only">{t("brand.name")}</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="main">
          {MAIN_NAV.map(([key, href]) => (
            <Link key={key} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-silver-light hover:bg-graphite-2 hover:text-white">
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          {(site?.englishSite || locale === "en") && <LocaleSwitch label={t("locale.switch")} ariaLabel={t("locale.switchLabel")} />}
          {signedIn && session?.user ? (
            <form action={logout} className="flex items-center gap-2">
              <Link href="/account" className="hidden rounded-lg px-3 py-2 text-sm text-silver-light hover:bg-graphite-2 hover:text-white sm:inline">
                {session.user.name || t("auth.account")}
              </Link>
              <button className="rounded-lg px-3 py-2 text-sm hover:bg-graphite-2">{t("auth.logout")}</button>
            </form>
          ) : (
            <form action={login} className="flex items-center gap-2">
              <button className="whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-graphite-2">{t("auth.login")}</button>
              {/* Sign-up is the phone + code page: a new number creates the account, then the sign-up form. */}
              <button formAction={signup} className="whitespace-nowrap rounded-lg bg-gold px-4 py-2 text-sm font-bold text-graphite hover:bg-gold-light">
                {t("auth.signup")}
              </button>
            </form>
          )}
        </div>
      </div>
      {expired && (
        <div role="status" className="border-t border-graphite-3 bg-gold/15">
          <form action={login} className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-white">
            <span>{t("auth.expired")}</span>
            <button className="rounded-lg bg-gold px-4 py-1.5 text-sm font-bold text-graphite hover:bg-gold-light">{t("auth.loginAgain")}</button>
          </form>
        </div>
      )}
    </header>
  );
}
