import type { PageProps } from "keycloakify/login/pages/PageProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

/** Step 1 of phone OTP: enter the mobile number (PhoneOtpAuthenticator, formAction=send). */
export default function LoginPhone(props: PageProps<Extract<KcContext, { pageId: "login-phone.ftl" }>, I18n>) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, msgStr } = i18n;
  const { url, phone } = kcContext;

  return (
    <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={msg("phoneTitle")}>
      <p className="mb-5 leading-8 text-text-2">{msg("phoneSubtitle")}</p>
      <form id="kc-phone-form" className={kcClsx("kcFormClass")} action={url.loginAction} method="post" noValidate>
        <input type="hidden" name="formAction" value="send" />
        <div className={kcClsx("kcFormGroupClass")}>
          <label htmlFor="phone" className={kcClsx("kcLabelClass")}>
            {msg("phoneLabel")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            autoFocus
            required
            defaultValue={phone ?? ""}
            placeholder={msgStr("phonePlaceholder")}
            aria-describedby="phone-hint"
            className={kcClsx("kcInputClass")}
          />
          <small id="phone-hint" className={kcClsx("kcInputHelperTextAfterClass")}>
            {msg("phoneHint")}
          </small>
        </div>
        <button type="submit" className={kcClsx("kcButtonClass", "kcButtonPrimaryClass", "kcButtonBlockClass", "kcButtonLargeClass")}>
          {msg("sendCode")}
        </button>
      </form>
      <p className="mt-5 text-xs leading-6 text-text-3">{msg("phoneLegal")}</p>
    </Template>
  );
}
