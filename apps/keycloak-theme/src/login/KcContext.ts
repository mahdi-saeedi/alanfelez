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
  };
  "login-phone-otp.ftl": {
    phoneMasked: string;
    phoneNational: string;
    codeLength: number;
    resendIn: number;
  };
};

export type KcContext = ExtendKcContext<KcContextExtension, KcContextExtensionPerPage>;
