/**
 * «رمز عبور را فراموش کرده‌اید؟» on the password page (login.ftl): Keycloak's own reset sends an e-mail, which can't
 * work here (no SMTP). Instead the link sets a short-lived cookie and restarts the login: the phone OTP step
 * (PhoneOtpAuthenticator.RESET_COOKIE) then runs in reset mode, and after the SMS code Keycloak asks for a new password.
 */
export const RESET_COOKIE = "alanfelez_reset";
export const FORGOT_HREF = "#forgot-password";

/** Click handler for the forgot-password link; `restartUrl` is kcContext.url.loginRestartFlowUrl. */
export function startSmsReset(restartUrl: string) {
  document.cookie = `${RESET_COOKIE}=1; path=/; max-age=600; SameSite=Lax`;
  window.location.href = restartUrl;
}
