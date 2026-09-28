import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { keycloak } from "@/lib/keycloak";
import { readSession } from "@/lib/session-refresh";
import { Link } from "@/i18n/navigation";
import { auth, signIn, signOut } from "@/auth";
import { LocaleSwitch } from "./LocaleSwitch";

const NAV = ["home", "prices", "chart", "analysis", "auctions", "calculator"] as const;
const HREF: Record<(typeof NAV)[number], string> = {
  home: "/",
  prices: "/prices",
  chart: "/chart",
  analysis: "/analysis",
  auctions: "/auctions",
  calculator: "/calculator",
};

export async function Header() {
  const t = await getTranslations();
  const locale = await getLocale();
  const session = await auth();

  async function login() {
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
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-extrabold text-white">
          <img src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
          {t("brand.name")}
        </Link>
        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="main">
          {NAV.map((key) => (
            <Link key={key} href={HREF[key]} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-silver-light hover:bg-graphite-2 hover:text-white">
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          <LocaleSwitch label={t("locale.switch")} ariaLabel={t("locale.switchLabel")} />
          {session?.user ? (
            <form action={logout} className="flex items-center gap-2">
              <Link href="/account" className="hidden rounded-lg px-3 py-2 text-sm text-silver-light hover:bg-graphite-2 hover:text-white sm:inline">
                {session.user.name || t("auth.account")}
              </Link>
              <button className="rounded-lg px-3 py-2 text-sm hover:bg-graphite-2">{t("auth.logout")}</button>
            </form>
          ) : (
            <form action={login} className="flex items-center gap-2">
              <button className="whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-graphite-2">{t("auth.login")}</button>
              <button className="whitespace-nowrap rounded-lg bg-gold px-4 py-2 text-sm font-bold text-graphite hover:bg-gold-light">
                {t("auth.start")}
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
