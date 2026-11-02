import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { POST_BUTTON } from "./post-button";

/**
 * The same «تحلیل خودت را بگذار» button for visitors and free members (client, 2026-11-02): it opens a short note that
 * posting is for Silver and Gold members, with the way to the plans. No JavaScript needed (a details element).
 */
export async function PostAnalysisTeaser({ plan }: { plan: string }) {
  const t = await getTranslations("analysis.community.teaser");
  return (
    <details className="group">
      <summary className={`${POST_BUTTON} list-none [&::-webkit-details-marker]:hidden`}>
        <span aria-hidden>✍️</span> {t("button")}
      </summary>
      <div className="mt-3 max-w-xl rounded-card border border-gold/40 bg-surface p-4 shadow-soft">
        <p className="font-bold">{t("title", { plan })}</p>
        <p className="mt-1 text-sm leading-7 text-text-2">{t("text")}</p>
        <Link href="/plans" className="mt-3 inline-block rounded-lg bg-gold px-4 py-2 text-sm font-bold text-graphite hover:bg-gold-light">{t("cta")}</Link>
      </div>
    </details>
  );
}
