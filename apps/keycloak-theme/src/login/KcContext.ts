/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { ExtendKcContext } from "keycloakify/login";
import type { KcEnvName, ThemeName } from "../kc.gen";

export type KcContextExtension = {
  themeName: ThemeName;
  properties: Record<KcEnvName, string> & {};
};

/**
 * Custom pages rendered by the phone OTP authenticator (services/keycloak/extensions, PhoneOtpAuthenticator).
 * Keycloakify generates one .ftl per key below. The attributes are set with form().setAttribute(...) in Java.
 */
export type KcContextExtensionPerPage = {
  "login-phone.ftl": {
    phone?: string;
    /** «رمز عبور را فراموش کرده‌اید؟»: existing accounts only, a new password right after the code. */
    resetMode?: boolean;
  };
  "login-phone-otp.ftl": {
    phoneMasked: string;
    phoneNational: string;
    codeLength: number;
    resendIn: number;
  };
  /** Sign-up form after the first SMS code (PhoneOtpAuthenticator.signupForm). Errors are message keys per field. */
  "login-complete-signup.ftl": {
    phoneNational: string;
    needPassword: boolean;
    values: { fullName: string; activity: string; metals: string[]; province: string; city: string; address: string };
    fieldErrors: Record<string, string>;
    activities: string[];
    metalOptions: string[];
    provinces: string[];
    termsUrl: string;
    privacyUrl: string;
  };
};

export type KcContext = ExtendKcContext<KcContextExtension, KcContextExtensionPerPage>;
