import { useEffect, useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { TemplateProps } from "keycloakify/login/TemplateProps";
import type { I18n } from "./i18n";
import type { KcContext } from "./KcContext";
import logoUrl from "../assets/logo.png";

const RTL_LANGUAGES = new Set(["fa", "ar", "he"]);

/**
 * Language links: keep the current URL (all OAuth / login-action parameters) and only change the locale.
 * On the OIDC auth endpoint Keycloak honours the standard `ui_locales` parameter; on login-action pages `kc_locale`.
 * (The hrefs Keycloak 26.3 generates for the first page restart the flow and lose response_type.)
 */
function localeHref(languageTag: string): string {
  const u = new URL(window.location.href);
  const param = u.pathname.endsWith("/protocol/openid-connect/auth") ? "ui_locales" : "kc_locale";
  u.searchParams.delete("ui_locales");
  u.searchParams.delete("kc_locale");
  u.searchParams.set(param, languageTag);
  return u.toString();
}

const ALERT_STYLES = {
  error: "bg-down-bg text-down",
  warning: "bg-amber-50 text-amber-800",
  success: "bg-up-bg text-up",
  info: "bg-info-bg text-info",
} as const;

/** Branded page frame: logo, card, language switch, messages, "try another way". */
export default function Template(props: TemplateProps<KcContext, I18n>) {
  const { displayMessage = true, headerNode, socialProvidersNode = null, infoNode = null, displayInfo = false } = props;
  const { documentTitle, kcContext, i18n, doUseDefaultCss, classes, children } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, msgStr, currentLanguage, enabledLanguages } = i18n;
  const { auth, url, message, isAppInitiatedAction } = kcContext;
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    document.title = documentTitle ?? msgStr("loginTitle");
    const lang = currentLanguage.languageTag;
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGUAGES.has(lang.split("-")[0] ?? lang) ? "rtl" : "ltr";
  }, [documentTitle, currentLanguage.languageTag, msgStr]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <header className="mb-6 flex flex-col items-center gap-3 text-center">
        <img src={logoUrl} alt="" width={72} height={72} className="h-18 w-18 rounded-2xl shadow-card" />
        <div className="text-2xl font-extrabold text-white">{msg("brandName")}</div>
        <div className="text-sm text-silver-light">{msg("brandTagline")}</div>
      </header>

      <main className="w-full max-w-md rounded-card bg-surface p-6 shadow-card sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h1 id="kc-page-title" className="text-xl font-extrabold text-graphite">
            {auth?.showUsername && !auth.showResetCredentials ? (
              <span className="flex flex-wrap items-center gap-2">
                <span dir="ltr">{auth.attemptedUsername}</span>
                <a href={url.loginRestartFlowUrl} className="text-sm font-semibold" aria-label={msgStr("restartLoginTooltip")}>
                  {msg("restartLoginTooltip")}
                </a>
              </span>
            ) : (
              headerNode
            )}
          </h1>

          {enabledLanguages.length > 1 && (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={langOpen}
                aria-label={msgStr("languages")}
                onClick={() => setLangOpen((o) => !o)}
                className="rounded-control border border-border px-3 py-1.5 text-sm text-text-2 hover:border-gold"
              >
                {currentLanguage.label}
              </button>
              {langOpen && (
                <ul role="menu" className="absolute end-0 z-10 mt-1 min-w-32 overflow-hidden rounded-control border border-border bg-white shadow-card">
                  {enabledLanguages.map(({ languageTag, label }) => (
                    <li key={languageTag} role="none">
                      <a role="menuitem" href={localeHref(languageTag)} className="block px-3 py-2 text-sm text-text hover:bg-surface-2">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {displayMessage && message !== undefined && (message.type !== "warning" || !isAppInitiatedAction) && (
          <div role="alert" className={`${kcClsx("kcAlertClass")} ${ALERT_STYLES[message.type]}`}>
            <span dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }} />
          </div>
        )}

        {children}

        {auth?.showTryAnotherWayLink && (
          <form id="kc-select-try-another-way-form" action={url.loginAction} method="post" className="mt-4">
            <input type="hidden" name="tryAnotherWay" value="on" />
            <button type="submit" className={kcClsx("kcButtonClass", "kcButtonDefaultClass", "kcButtonBlockClass")}>
              {msg("doTryAnotherWay")}
            </button>
          </form>
        )}

        {socialProvidersNode}
        {displayInfo && <div className="mt-5 border-t border-border pt-4 text-sm text-text-2">{infoNode}</div>}
      </main>
    </div>
  );
}
