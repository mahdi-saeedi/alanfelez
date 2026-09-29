"use client";

import { useTranslations } from "next-intl";

/** Localized error boundary for pages (the layout stays). `digest` matches the server log line for support. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("error");
  return (
    <section className="mx-auto max-w-lg px-4 py-24 text-center" role="alert">
      <h1 className="text-2xl font-extrabold">{t("errorTitle")}</h1>
      <p className="mt-2 text-text-2">{t("errorBody")}</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-graphite px-6 py-2.5 font-bold text-white hover:bg-graphite-2">{t("retry")}</button>
      {error.digest && <p className="mt-4 text-xs text-text-3" dir="ltr">{t("code", { code: error.digest })}</p>}
    </section>
  );
}
