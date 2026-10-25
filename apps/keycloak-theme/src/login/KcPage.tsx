import { Suspense, lazy } from "react";
import DefaultPage from "keycloakify/login/DefaultPage";
import type { KcContext } from "./KcContext";
import { useI18n } from "./i18n";
import Template from "./Template";
import { classes } from "./classes";
import "./main.css";

const UserProfileFormFields = lazy(() => import("keycloakify/login/UserProfileFormFields"));
const LoginPhone = lazy(() => import("./pages/LoginPhone"));
const LoginPhoneOtp = lazy(() => import("./pages/LoginPhoneOtp"));
const LoginUpdateProfile = lazy(() => import("./pages/LoginUpdateProfile"));
const LoginCompleteSignup = lazy(() => import("./pages/LoginCompleteSignup"));

// Our Tailwind classes replace Keycloak's default CSS on every page.
const doUseDefaultCss = false;

export default function KcPage(props: { kcContext: KcContext }) {
  const { kcContext } = props;
  const { i18n } = useI18n({ kcContext });

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
          case "login-update-profile.ftl":
            return <LoginUpdateProfile kcContext={kcContext} i18n={i18n} classes={classes} Template={Template} doUseDefaultCss={doUseDefaultCss} />;
          default:
            return (
              <DefaultPage
                kcContext={kcContext}
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
