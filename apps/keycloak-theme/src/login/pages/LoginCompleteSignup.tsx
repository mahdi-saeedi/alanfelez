import { useState } from "react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { toPersianDigits } from "@alanfelez/ui/format";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

/**
 * Sign-up form (client, 2026-10-25), shown once after the SMS code by PhoneOtpAuthenticator (formAction=complete):
 * name or company, the verified phone (read-only), password + repeat, activity and the terms are required; specialty
 * metals, province, city and address are optional. Older accounts see it once with what they already have filled in.
 * The server checks everything again (SignupForm.java); the required marks and the disabled button only help.
 */
export default function LoginCompleteSignup(props: PageProps<Extract<KcContext, { pageId: "login-complete-signup.ftl" }>, I18n>) {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, msgStr, currentLanguage } = i18n;
  const { url, phoneNational, needPassword, values, fieldErrors, activities, metalOptions, provinces, termsUrl, privacyUrl } = kcContext;
  const isFa = currentLanguage.languageTag.startsWith("fa");
  const [terms, setTerms] = useState(false);
  const label = (key: string) => msgStr(key as Parameters<typeof msgStr>[0]);
  const err = (name: string) => fieldErrors[name];
  const sortedProvinces = [...provinces].sort((a, b) => label(`province_${a}`).localeCompare(label(`province_${b}`), isFa ? "fa" : "en"));

  const FieldError = ({ name }: { name: string }) =>
    err(name) ? (
      <span id={`${name}-error`} className={kcClsx("kcInputErrorMessageClass")} aria-live="polite">
        {label(err(name)!)}
      </span>
    ) : null;
  const Label = ({ htmlFor, text, required }: { htmlFor?: string; text: string; required: boolean }) => (
    <label htmlFor={htmlFor} className={kcClsx("kcLabelClass")}>
      {text}
      {required ? <span className="text-down"> *</span> : <span className="font-normal text-text-3"> ({msgStr("optional")})</span>}
    </label>
  );
  const invalid = (name: string) => ({ "aria-invalid": !!err(name), "aria-describedby": err(name) ? `${name}-error` : undefined });

  return (
    <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={msg("signupTitle")}>
      <p className="mb-5 leading-8 text-text-2">{msg("signupSubtitle")}</p>
      <form id="kc-signup-form" className={kcClsx("kcFormClass")} action={url.loginAction} method="post" noValidate>
        <input type="hidden" name="formAction" value="complete" />

        <div className={kcClsx("kcFormGroupClass")}>
          <Label htmlFor="fullName" text={msgStr("profileFullName")} required />
          <input id="fullName" name="fullName" type="text" autoComplete="name" required maxLength={100} defaultValue={values.fullName} className={kcClsx("kcInputClass")} {...invalid("fullName")} />
          <FieldError name="fullName" />
        </div>

        <div className={kcClsx("kcFormGroupClass")}>
          <Label htmlFor="phone" text={msgStr("signupPhone")} required />
          <input id="phone" type="tel" dir="ltr" readOnly value={isFa ? toPersianDigits(phoneNational) : phoneNational} className={`${kcClsx("kcInputClass")} bg-surface-2 text-text-2`} aria-describedby="phone-hint" />
          <small id="phone-hint" className={kcClsx("kcInputHelperTextAfterClass")}>{msg("signupPhoneHint")}</small>
        </div>

        {needPassword && (
          <>
            <div className={kcClsx("kcFormGroupClass")}>
              <Label htmlFor="password" text={msgStr("signupPassword")} required />
              <input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={10} className={kcClsx("kcInputClass")} {...invalid("password")} />
              {err("password") ? <FieldError name="password" /> : <small className={kcClsx("kcInputHelperTextAfterClass")}>{msg("signupPasswordHint")}</small>}
            </div>
            <div className={kcClsx("kcFormGroupClass")}>
              <Label htmlFor="passwordConfirm" text={msgStr("signupPasswordConfirm")} required />
              <input id="passwordConfirm" name="passwordConfirm" type="password" dir="ltr" autoComplete="new-password" required className={kcClsx("kcInputClass")} {...invalid("passwordConfirm")} />
              <FieldError name="passwordConfirm" />
            </div>
          </>
        )}

        <div className={kcClsx("kcFormGroupClass")}>
          <Label htmlFor="activity" text={msgStr("signupActivity")} required />
          <select id="activity" name="activity" required defaultValue={values.activity} className={`${kcClsx("kcInputClass")} invalid:text-text-3`} {...invalid("activity")}>
            <option value="" disabled>{msgStr("signupActivityPlaceholder")}</option>
            {activities.map((a) => <option key={a} value={a} className="text-text">{label(`activity_${a}`)}</option>)}
          </select>
          <FieldError name="activity" />
        </div>

        <fieldset className={kcClsx("kcFormGroupClass")}>
          <legend className="mb-1.5"><Label text={msgStr("signupMetals")} required={false} /></legend>
          <div className="flex flex-wrap gap-2">
            {metalOptions.map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="checkbox" name="metals" value={m} defaultChecked={values.metals.includes(m)} className="peer sr-only" />
                <span className="inline-block rounded-full border border-border bg-white px-3.5 py-1.5 text-sm peer-checked:border-gold peer-checked:bg-gold/15 peer-checked:font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-gold">
                  {label(`metal_${m}`)}
                </span>
              </label>
            ))}
          </div>
          <small className={kcClsx("kcInputHelperTextAfterClass")}>{msg("signupMetalsHint")}</small>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={kcClsx("kcFormGroupClass")}>
            <Label htmlFor="province" text={msgStr("signupProvince")} required={false} />
            <select id="province" name="province" defaultValue={values.province} className={kcClsx("kcInputClass")} {...invalid("province")}>
              <option value="">{msgStr("signupProvincePlaceholder")}</option>
              {sortedProvinces.map((p) => <option key={p} value={p}>{label(`province_${p}`)}</option>)}
            </select>
            <FieldError name="province" />
          </div>
          <div className={kcClsx("kcFormGroupClass")}>
            <Label htmlFor="city" text={msgStr("signupCity")} required={false} />
            <input id="city" name="city" type="text" autoComplete="address-level2" maxLength={60} defaultValue={values.city} className={kcClsx("kcInputClass")} {...invalid("city")} />
            <FieldError name="city" />
          </div>
        </div>

        <div className={kcClsx("kcFormGroupClass")}>
          <Label htmlFor="address" text={msgStr("signupAddress")} required={false} />
          <textarea id="address" name="address" rows={2} autoComplete="street-address" maxLength={300} defaultValue={values.address} className={kcClsx("kcInputClass")} {...invalid("address")} />
          <FieldError name="address" />
        </div>

        <div className="grid gap-1.5">
          <label className="flex items-start gap-2 text-sm leading-7 text-text-2">
            <input type="checkbox" name="terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1.5 size-4 shrink-0 accent-gold" {...invalid("terms")} />
            <span>
              {msg("signupTermsBefore")}{" "}
              <a href={termsUrl} target="_blank" rel="noopener" className="font-semibold text-gold-dark underline underline-offset-4">{msg("signupTermsLink")}</a>{" "}
              {msg("signupTermsAnd")}{" "}
              <a href={privacyUrl} target="_blank" rel="noopener" className="font-semibold text-gold-dark underline underline-offset-4">{msg("signupPrivacyLink")}</a>{" "}
              {msg("signupTermsAfter")}
            </span>
          </label>
          <FieldError name="terms" />
        </div>

        <button type="submit" disabled={!terms} className={kcClsx("kcButtonClass", "kcButtonPrimaryClass", "kcButtonBlockClass", "kcButtonLargeClass")}>
          {msg("signupSubmit")}
        </button>
      </form>
    </Template>
  );
}
