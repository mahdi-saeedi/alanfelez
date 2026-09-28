import { useEffect, useState } from "react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { toPersianDigits } from "@alanfelez/ui/format";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

/** Step 2 of phone OTP: enter the SMS code, resend (cooldown enforced by the server too), or change number. */
export default function LoginPhoneOtp(props: PageProps<Extract<KcContext, { pageId: "login-phone-otp.ftl" }>, I18n>) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, currentLanguage } = i18n;
  const { url, phoneNational, codeLength, resendIn } = kcContext;
  const isFa = currentLanguage.languageTag.startsWith("fa");
  const digits = (n: number | string) => (isFa ? toPersianDigits(String(n)) : String(n));

  const [secondsLeft, setSecondsLeft] = useState(resendIn);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return (
    <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={msg("otpTitle")}>
      <p className="mb-5 leading-8 text-text-2">
        {msg("otpSentTo", "⁦" + digits(phoneNational) + "⁩")}
      </p>

      <form id="kc-otp-form" className={kcClsx("kcFormClass")} action={url.loginAction} method="post" noValidate>
        <input type="hidden" name="formAction" value="verify" />
        <div className={kcClsx("kcFormGroupClass")}>
          <label htmlFor="code" className={kcClsx("kcLabelClass")}>
            {msg("otpLabel")}
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            autoFocus
            required
            maxLength={codeLength}
            placeholder={"•".repeat(codeLength)}
            className={`${kcClsx("kcInputClass")} text-center text-2xl font-bold tracking-[0.5em]`}
          />
        </div>
        <button type="submit" className={kcClsx("kcButtonClass", "kcButtonPrimaryClass", "kcButtonBlockClass", "kcButtonLargeClass")}>
          {msg("verifyCode")}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <form action={url.loginAction} method="post" className="flex items-center gap-2">
          <input type="hidden" name="formAction" value="resend" />
          <button type="submit" disabled={secondsLeft > 0} className="cursor-pointer font-semibold text-gold-dark disabled:cursor-not-allowed disabled:opacity-50">
            {msg("resendCode")}
          </button>
          {secondsLeft > 0 && <span className="text-text-3">{msg("resendIn", digits(secondsLeft))}</span>}
        </form>
        <form action={url.loginAction} method="post">
          <input type="hidden" name="formAction" value="change" />
          <button type="submit" className="cursor-pointer font-semibold text-gold-dark">
            {msg("changePhone")}
          </button>
        </form>
      </div>
    </Template>
  );
}
