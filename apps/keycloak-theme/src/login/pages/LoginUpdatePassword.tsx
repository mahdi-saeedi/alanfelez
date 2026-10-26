import type { PageProps } from "keycloakify/login/pages/PageProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { toPersianDigits } from "@alanfelez/ui/format";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

/**
 * New password (Keycloak's UPDATE_PASSWORD), after «رمز عبور را فراموش کرده‌اید؟» and the SMS code, or from the account
 * page. Shows the username read-only (Keycloak sends it to this page as `username`), so the user knows what to sign in
 * with, then the new password and its repeat.
 */
export default function LoginUpdatePassword(props: PageProps<Extract<KcContext, { pageId: "login-update-password.ftl" }>, I18n>) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, msgStr, currentLanguage } = i18n;
  const { url, messagesPerField, isAppInitiatedAction, auth } = kcContext;
  const isFa = currentLanguage.languageTag.startsWith("fa");
  const username = (kcContext as { username?: string }).username ?? auth?.attemptedUsername;
  const invalid = messagesPerField.existsError("password", "password-confirm");
  const error = (field: string) =>
    messagesPerField.existsError(field) && (
      <span id={`input-error-${field}`} className={kcClsx("kcInputErrorMessageClass")} aria-live="polite"
        dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.get(field)) }} />
    );

  return (
    // The username is shown in the form, not in place of the title (Template does that when showUsername is set).
    <Template kcContext={{ ...kcContext, auth: auth && { ...auth, showUsername: false } }} i18n={i18n} doUseDefaultCss={doUseDefaultCss}
      classes={classes} displayMessage={!invalid} headerNode={msg("updatePasswordTitle")}>
      <form id="kc-passwd-update-form" className={kcClsx("kcFormClass")} action={url.loginAction} method="post">
        {username && (
          <div className={kcClsx("kcFormGroupClass")}>
            <label htmlFor="username" className={kcClsx("kcLabelClass")}>{msg("username")}</label>
            <input id="username" type="text" dir="ltr" readOnly value={isFa ? toPersianDigits(username) : username}
              autoComplete="username" className={`${kcClsx("kcInputClass")} bg-surface-2 text-text-2`} aria-describedby="username-hint" />
            <small id="username-hint" className={kcClsx("kcInputHelperTextAfterClass")}>{msg("usernameHint")}</small>
          </div>
        )}
        <div className={kcClsx("kcFormGroupClass")}>
          <label htmlFor="password-new" className={kcClsx("kcLabelClass")}>{msg("passwordNew")}</label>
          <input id="password-new" name="password-new" type="password" dir="ltr" autoFocus autoComplete="new-password"
            className={kcClsx("kcInputClass")} aria-invalid={invalid} />
          {error("password")}
        </div>
        <div className={kcClsx("kcFormGroupClass")}>
          <label htmlFor="password-confirm" className={kcClsx("kcLabelClass")}>{msg("passwordConfirm")}</label>
          <input id="password-confirm" name="password-confirm" type="password" dir="ltr" autoComplete="new-password"
            className={kcClsx("kcInputClass")} aria-invalid={invalid} />
          {error("password-confirm")}
        </div>
        <button type="submit" className={kcClsx("kcButtonClass", "kcButtonPrimaryClass", "kcButtonBlockClass", "kcButtonLargeClass")}>
          {msgStr("doSubmit")}
        </button>
        {isAppInitiatedAction && (
          <button type="submit" name="cancel-aia" value="true" className={`${kcClsx("kcButtonClass", "kcButtonDefaultClass", "kcButtonBlockClass")} mt-3`}>
            {msg("doCancel")}
          </button>
        )}
      </form>
    </Template>
  );
}
