import { useState } from "react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { toPersianDigits } from "@alanfelez/ui/format";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

/**
 * Sign-up form (client, 2026-10-25; layout 2026-11-01), shown once after the SMS code by PhoneOtpAuthenticator
 * (formAction=complete). Two parts: the sign-in details in their own box (the verified phone as user name, password +
 * repeat), then, under a gold divider, «مشخصات شما»: full name, activity, at least one specialty metal (tick boxes) and
 * the terms are required; company, province, city and address are optional. Older accounts see it once with what they
 * already have filled in.
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

        <section className="mb-2 rounded-2xl border border-border bg-surface-2 p-4" aria-labelledby="login-box">
          <h2 id="login-box" className="mb-3 flex items-center gap-2 font-extrabold">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-graphite text-gold">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-3 3 3 3m-6 0 2 2" /></svg>
            </span>
            {msg("signupLoginBox")}
          </h2>
          <div className={kcClsx("kcFormGroupClass")}>
            <Label htmlFor="phone" text={msgStr("signupPhone")} required />
            <input id="phone" type="tel" dir="ltr" readOnly value={isFa ? toPersianDigits(phoneNational) : phoneNational} className={`${kcClsx("kcInputClass")} bg-surface text-text-2`} aria-describedby="phone-hint" />
            <small id="phone-hint" className={kcClsx("kcInputHelperTextAfterClass")}>{msg("signupPhoneHint")}</small>
          </div>
          {needPassword && (
            <div className="grid gap-x-3 sm:grid-cols-2">
              <div className={kcClsx("kcFormGroupClass")}>
                <Label htmlFor="password" text={msgStr("signupPassword")} required />
                <input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={4} className={kcClsx("kcInputClass")} {...invalid("password")} />
                {err("password") ? <FieldError name="password" /> : <small className={kcClsx("kcInputHelperTextAfterClass")}>{msg("signupPasswordHint")}</small>}
              </div>
              <div className={kcClsx("kcFormGroupClass")}>
                <Label htmlFor="passwordConfirm" text={msgStr("signupPasswordConfirm")} required />
                <input id="passwordConfirm" name="passwordConfirm" type="password" dir="ltr" autoComplete="new-password" required className={kcClsx("kcInputClass")} {...invalid("passwordConfirm")} />
                <FieldError name="passwordConfirm" />
              </div>
            </div>
          )}
        </section>

        <div className="my-6 flex items-center gap-3 text-sm font-extrabold text-gold-dark" role="presentation">
          <span className="h-px flex-1 bg-gradient-to-l from-gold to-transparent" />
          <span aria-hidden>◆</span>
          <span>{msg("signupAboutYou")}</span>
          <span aria-hidden>◆</span>
          <span className="h-px flex-1 bg-gradient-to-r from-gold to-transparent" />
        </div>

        <div className={kcClsx("kcFormGroupClass")}>
          <Label htmlFor="fullName" text={msgStr("profileFullName")} required />
          <input id="fullName" name="fullName" type="text" autoComplete="name" required maxLength={100} defaultValue={values.fullName} className={kcClsx("kcInputClass")} {...invalid("fullName")} />
          <FieldError name="fullName" />
        </div>

        <div className={kcClsx("kcFormGroupClass")}>
          <Label htmlFor="company" text={msgStr("signupCompany")} required={false} />
          <input id="company" name="company" type="text" autoComplete="organization" maxLength={100} defaultValue={values.company} placeholder={msgStr("signupCompanyPlaceholder")} className={kcClsx("kcInputClass")} {...invalid("company")} />
          <FieldError name="company" />
        </div>

        <div className={kcClsx("kcFormGroupClass")}>
          <Label htmlFor="activity" text={msgStr("signupActivity")} required />
          <select id="activity" name="activity" required defaultValue={values.activity} className={`${kcClsx("kcInputClass")} invalid:text-text-3`} {...invalid("activity")}>
            <option value="" disabled>{msgStr("signupActivityPlaceholder")}</option>
            {activities.map((a) => <option key={a} value={a} className="text-text">{label(`activity_${a}`)}</option>)}
          </select>
          <FieldError name="activity" />
        </div>

        <fieldset className={kcClsx("kcFormGroupClass")} aria-describedby={err("metals") ? "metals-error" : "metals-hint"}>
          <legend className="mb-1.5">
            <Label text={msgStr("signupMetals")} required />
            <small id="metals-hint" className="ms-1 text-text-3">— {msg("signupMetalsHint")}</small>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metalOptions.map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="checkbox" name="metals" value={m} defaultChecked={values.metals.includes(m)} className="peer sr-only" />
                <span className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm peer-checked:border-gold peer-checked:bg-gold/10 peer-checked:font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-gold peer-checked:[&>i]:border-gold peer-checked:[&>i]:bg-gold peer-checked:[&_svg]:opacity-100">
                  <i aria-hidden className="grid size-4 shrink-0 place-items-center rounded border-[1.5px] border-text-3 not-italic">
                    <svg viewBox="0 0 12 12" className="size-3 text-white opacity-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2.5 6.5 2.5 2.5 4.5-5" /></svg>
                  </i>
                  {label(`metal_${m}`)}
                </span>
              </label>
            ))}
          </div>
          <FieldError name="metals" />
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
