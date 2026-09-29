import { useState } from "react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

// Set when the form is submitted, so the server's "required" errors show after a submit but not on the first visit
// (Keycloak's verify-profile step marks empty required fields as errors before the user has typed anything).
const SUBMITTED = "alanfelez.profile.submitted";

/**
 * Last step of sign-up (SCOPE §9): first name, last name, optional email. Keycloak shows this page (login-update-profile.ftl)
 * for the VERIFY_PROFILE required action whenever a required profile field is empty: right after a new account is created
 * by phone OTP, and once for older accounts without a name. The account page's "edit profile" (UPDATE_PROFILE) uses it too.
 * The phone number and username are read-only and not shown.
 */
export default function LoginUpdateProfile(props: PageProps<Extract<KcContext, { pageId: "login-update-profile.ftl" }>, I18n>) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, msgStr, advancedMsgStr } = i18n;
  const { url, messagesPerField, profile, isAppInitiatedAction } = kcContext;
  const [submitted] = useState(() => {
    try {
      const was = sessionStorage.getItem(SUBMITTED) === "1";
      sessionStorage.removeItem(SUBMITTED);
      return was;
    } catch {
      return true;
    }
  });

  const fields = [
    { name: "firstName", autoComplete: "given-name", type: "text" },
    { name: "lastName", autoComplete: "family-name", type: "text" },
    { name: "email", autoComplete: "email", type: "email" },
  ] as const;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      headerNode={msg(isAppInitiatedAction ? "profileEditTitle" : "profileTitle")}
      displayMessage={messagesPerField.exists("global")}
    >
      {!isAppInitiatedAction && <p className="mb-5 leading-8 text-text-2">{msg("profileSubtitle")}</p>}
      <form
        id="kc-update-profile-form"
        className={kcClsx("kcFormClass")}
        action={url.loginAction}
        method="post"
        onSubmit={() => {
          try {
            sessionStorage.setItem(SUBMITTED, "1");
          } catch {
            /* storage blocked: errors then always show */
          }
        }}
      >
        {fields.map((f) => {
          const attr = profile.attributesByName[f.name];
          if (!attr) return null;
          const error = submitted || !!attr.value ? messagesPerField.get(f.name) : "";
          return (
            <div key={f.name} className={kcClsx("kcFormGroupClass")}>
              <label htmlFor={f.name} className={kcClsx("kcLabelClass")}>
                {advancedMsgStr(attr.displayName ?? f.name)}
                {attr.required ? <span className="text-down"> *</span> : <span className="font-normal text-text-3"> ({msgStr("optional")})</span>}
              </label>
              <input
                id={f.name}
                name={f.name}
                type={f.type}
                autoComplete={f.autoComplete}
                dir={f.type === "email" ? "ltr" : undefined}
                defaultValue={attr.value ?? ""}
                required={attr.required}
                maxLength={f.type === "email" ? 255 : 60}
                aria-invalid={!!error}
                aria-describedby={error ? `${f.name}-error` : undefined}
                className={kcClsx("kcInputClass")}
              />
              {error && (
                <span id={`${f.name}-error`} className={kcClsx("kcInputErrorMessageClass")} aria-live="polite">
                  {error}
                </span>
              )}
            </div>
          );
        })}
        <div className={kcClsx("kcFormButtonsClass")}>
          <button type="submit" className={kcClsx("kcButtonClass", "kcButtonPrimaryClass", "kcButtonBlockClass", "kcButtonLargeClass")}>
            {msg("profileSubmit")}
          </button>
          {isAppInitiatedAction && (
            <button type="submit" name="cancel-aia" value="true" formNoValidate className={kcClsx("kcButtonClass", "kcButtonDefaultClass", "kcButtonLargeClass")}>
              {msg("doCancel")}
            </button>
          )}
        </div>
      </form>
    </Template>
  );
}
