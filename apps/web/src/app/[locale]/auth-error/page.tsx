import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { signInTo } from "@/lib/actions";
import { seo } from "@/lib/seo";

type Params = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ error?: string }> };

// Auth.js error codes we explain; anything else (Configuration, OAuthCallbackError, …) gets the general text.
const KNOWN = ["AccessDenied", "Verification"] as const;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "authError" });
  return seo(locale, "/auth-error", { title: t("title"), noindex: true });
}

/**
 * Where Auth.js sends a failed sign-in (pages.error in src/auth.ts), instead of its own English "Server error" page.
 * The site layout stays (header, footer), so the user can try again or go on browsing.
 */
export default async function AuthErrorPage({ params, searchParams }: Params) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("authError");
  const code = (await searchParams).error ?? "Default";
  const known = (KNOWN as readonly string[]).includes(code) ? code : "Default";
  const retry = signInTo.bind(null, "/", locale);
  return (
    <section className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="mt-3 leading-8 text-text-2">{t(`body.${known}`)}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <form action={retry}>
          <button className="rounded-lg bg-gold px-6 py-2.5 font-bold text-graphite hover:bg-gold-light">{t("retry")}</button>
        </form>
        <Link href="/" className="rounded-lg border border-border bg-surface px-6 py-2.5 font-bold hover:bg-surface-2">{t("home")}</Link>
      </div>
      <p className="mt-6 text-sm text-text-3">
        {t("help")} <Link href="/contact" className="font-semibold text-gold-dark hover:underline">{t("contact")}</Link>
      </p>
      <p className="mt-2 text-xs text-text-3">
        {t("code")}: <bdi dir="ltr">{code}</bdi>
      </p>
    </section>
  );
}
