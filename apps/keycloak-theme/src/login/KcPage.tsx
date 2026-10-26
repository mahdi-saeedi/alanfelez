import { Suspense, lazy, useEffect } from "react";
import DefaultPage from "keycloakify/login/DefaultPage";
import type { KcContext } from "./KcContext";
import { useI18n } from "./i18n";
import Template from "./Template";
import { classes } from "./classes";
import "./main.css";
import { FORGOT_HREF, startSmsReset } from "./forgot-password";
import { usernameFromInput } from "./username";

const UserProfileFormFields = lazy(() => import("keycloakify/login/UserProfileFormFields"));
const LoginPhone = lazy(() => import("./pages/LoginPhone"));
const LoginPhoneOtp = lazy(() => import("./pages/LoginPhoneOtp"));
const LoginUpdateProfile = lazy(() => import("./pages/LoginUpdateProfile"));
const LoginCompleteSignup = lazy(() => import("./pages/LoginCompleteSignup"));
const LoginUpdatePassword = lazy(() => import("./pages/LoginUpdatePassword"));

// Our Tailwind classes replace Keycloak's default CSS on every page.
const doUseDefaultCss = false;

export default function KcPage(props: { kcContext: KcContext }) {
  const { kcContext } = props;
  const { i18n } = useI18n({ kcContext });

  // Password page: its "forgot password" link starts the SMS reset instead of Keycloak's e-mail reset.
  const restartUrl = kcContext.url.loginRestartFlowUrl;
  useEffect(() => {
    if (kcContext.pageId !== "login.ftl") return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a?.getAttribute("href") === FORGOT_HREF) {
        e.preventDefault();
        startSmsReset(restartUrl);
      }
    };
    // The username is the mobile number: accept Persian digits, spaces and +98 as on the phone page.
    const onSubmit = (e: SubmitEvent) => {
      const input = (e.target as HTMLFormElement | null)?.querySelector<HTMLInputElement>("input[name=username]");
      if (input) input.value = usernameFromInput(input.value);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [kcContext.pageId, restartUrl]);

  return (
    <Suspense>
      {(() => {
        switch (kcContext.pageId) {
          case "login-phone.ftl":
            return <LoginPhone kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={doUseDefaultCss} />;
          case "login-phone-otp.ftl":
            return <LoginPhoneOtp kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={doUseDefaultCss} />;
          case "login-complete-signup.ftl":
            return <LoginCompleteSignup kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={doUseDefaultCss} />;
          case "login-update-password.ftl":
            return <LoginUpdatePassword kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={doUseDefaultCss} />;
          case "login-update-profile.ftl":
            return <LoginUpdateProfile kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={doUseDefaultCss} />;
          default:
            return (
              <DefaultPage
                kcContext={
                  kcContext.pageId === "login.ftl"
                    ? { ...kcContext, realm: { ...kcContext.realm, resetPasswordAllowed: true }, url: { ...kcContext.url, loginResetCredentialsUrl: FORGOT_HREF } }
                    : kcContext
                }
                i18n={i18n}
                classes={classes}
                Template={Template}
                doUseDefaultCss={doUseDefaultCss}
                UserProfileFormFields={UserProfileFormFields}
                doMakeUserConfirmPassword={true}
              />
            );
        }
      })()}
    </Suspense>
  );
}
