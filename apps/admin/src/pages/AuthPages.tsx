import { useEffect } from "react";
import { useLogin, useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { userManager } from "../providers/authProvider";

/** /login: go straight to Keycloak (branded login theme, staff TOTP enforced there). */
export function LoginPage() {
  const t = useTranslate();
  const { mutate: login } = useLogin();
  useEffect(() => login({}), [login]);
  return <p className="p-10 text-center text-text-2">{t("auth.signingIn")}</p>;
}

// The authorization code can be exchanged only once. React StrictMode runs effects twice in development,
// so the exchange is memoised at module level.
let callbackOnce: Promise<unknown> | undefined;

/** /callback: finish the PKCE code exchange, then enter the app. */
export function CallbackPage() {
  const t = useTranslate();
  const navigate = useNavigate();
  useEffect(() => {
    callbackOnce ??= userManager.signinRedirectCallback();
    callbackOnce.then(
      () => navigate("/", { replace: true }),
      () => navigate("/login", { replace: true }),
    );
  }, [navigate]);
  return <p className="p-10 text-center text-text-2">{t("auth.signingIn")}</p>;
}

export function DeniedPage() {
  const t = useTranslate();
  return (
    <div className="mx-auto mt-24 max-w-md rounded-card border border-border bg-surface p-6 text-center">
      <p className="text-down">{t("auth.denied")}</p>
      <button onClick={() => userManager.signoutRedirect()} className="mt-4 rounded-lg bg-graphite px-4 py-2 text-white">
        {t("auth.logout")}
      </button>
    </div>
  );
}
