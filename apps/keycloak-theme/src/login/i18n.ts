import { i18nBuilder } from "keycloakify/login";
import type { ThemeName } from "../kc.gen";

/*
 * Custom messages. Keycloakify also writes them into the theme's messages_*.properties, so keys used
 * server-side by the authenticator (form().setError("invalidPhone")) resolve too.
 * Keep this object literal inline (the build parses it).
 */
const { useI18n, ofTypeI18n } = i18nBuilder
  .withThemeName<ThemeName>()
  .withCustomTranslations({
    fa: {
      brandName: "الان‌فلز",
      brandTagline: "اطلاعات بازار فلزات، در یک نگاه",
      loginTitle: "ورود به الان‌فلز",
      phoneTitle: "ورود یا ثبت‌نام",
      phoneSubtitle: "برای ورود یا ساخت حساب، شماره موبایل خود را وارد کنید.",
      phoneLabel: "شماره موبایل",
      phonePlaceholder: "۰۹۱۲۳۴۵۶۷۸۹",
      phoneHint: "کد تأیید به این شماره پیامک می‌شود.",
      phoneLegal: "ورود شما به معنای پذیرش قوانین و شرایط استفاده و حریم خصوصی الان‌فلز است.",
      sendCode: "دریافت کد تأیید",
      otpTitle: "کد تأیید را وارد کنید",
      otpSentTo: "کد تأیید به شماره {0} پیامک شد.",
      otpLabel: "کد تأیید",
      verifyCode: "تأیید و ورود",
      resendCode: "ارسال دوباره کد",
      resendIn: "ارسال دوباره تا {0} ثانیه دیگر",
      changePhone: "تغییر شماره",
      invalidPhone: "شماره موبایل معتبر نیست. نمونه: ۰۹۱۲۳۴۵۶۷۸۹",
      invalidOtp: "کد وارد شده صحیح نیست.",
      otpExpired: "کد منقضی شده است. لطفاً کد جدید دریافت کنید.",
      otpTooManyAttempts: "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً کد جدید دریافت کنید.",
      otpRateLimited: "تعداد درخواست کد برای این شماره بیش از حد مجاز است. لطفاً بعداً تلاش کنید.",
      otpResendTooSoon: "لطفاً کمی صبر کنید و سپس دوباره درخواست دهید.",
      smsSendFailed: "ارسال پیامک با خطا مواجه شد. لطفاً دوباره تلاش کنید.",
      "alanfelez-phone-otp-display-name": "ورود با شماره موبایل",
      "alanfelez-phone-otp-help-text": "دریافت کد یک‌بارمصرف با پیامک",
      "auth-username-password-form-display-name": "ورود با رمز عبور",
      "auth-username-password-form-help-text": "ورود با نام کاربری یا موبایل و رمز عبور",
    },
    en: {
      brandName: "Alan Felez",
      brandTagline: "Metals market information at a glance",
      loginTitle: "Sign in to Alan Felez",
      phoneTitle: "Sign in or sign up",
      phoneSubtitle: "Enter your mobile number to sign in or create an account.",
      phoneLabel: "Mobile number",
      phonePlaceholder: "09123456789",
      phoneHint: "We will text a verification code to this number.",
      phoneLegal: "By continuing you accept Alan Felez's Terms of use and Privacy policy.",
      sendCode: "Send code",
      otpTitle: "Enter the verification code",
      otpSentTo: "We sent a code to {0}.",
      otpLabel: "Verification code",
      verifyCode: "Verify and sign in",
      resendCode: "Resend code",
      resendIn: "Resend in {0} seconds",
      changePhone: "Change number",
      invalidPhone: "This mobile number is not valid. Example: 09123456789",
      invalidOtp: "The code is incorrect.",
      otpExpired: "The code has expired. Please request a new one.",
      otpTooManyAttempts: "Too many attempts. Please request a new code.",
      otpRateLimited: "Too many codes were requested for this number. Please try again later.",
      otpResendTooSoon: "Please wait a moment before requesting a new code.",
      smsSendFailed: "We could not send the SMS. Please try again.",
      "alanfelez-phone-otp-display-name": "Sign in with mobile number",
      "alanfelez-phone-otp-help-text": "Receive a one-time code by SMS",
      "auth-username-password-form-display-name": "Sign in with password",
      "auth-username-password-form-help-text": "Username or mobile number and password",
    },
  })
  .build();

type I18n = typeof ofTypeI18n;

export { useI18n, type I18n };
