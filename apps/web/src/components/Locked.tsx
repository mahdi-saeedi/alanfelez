import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

type Plan = "free" | "silver" | "gold";

/**
 * Presentation of a locked feature (🔒 + upgrade CTA). It never receives the locked data itself: the API doesn't
 * send it (ADR-0010), so there's nothing to blur or reveal.
 */
export async function Locked({ plan, title, children }: { plan: Plan; title?: string; children?: ReactNode }) {
  const t = await getTranslations("lock");
  const planName = t(`plan.${plan}`);
  return (
    <div className="rounded-card border border-gold/60 bg-surface">
      {title && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-bold">{title}</h3>
          <TierBadge plan={plan} label={planName} />
        </div>
      )}
      <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
        <LockIcon />
        {children && <p className="text-sm text-text-2">{children}</p>}
        <Link href="/plans" className="rounded-lg bg-gold px-5 py-2 text-sm font-bold text-graphite hover:bg-gold-light">
          {t("upgrade", { plan: planName })}
        </Link>
      </div>
    </div>
  );
}

export function TierBadge({ plan, label }: { plan: Plan; label: string }) {
  const tone = plan === "gold" ? "bg-gold/15 text-gold-dark" : plan === "silver" ? "bg-info-bg text-graphite-3" : "bg-surface-2 text-text-2";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{label}</span>;
}

export function LockIcon({ className = "h-7 w-7" }: { className?: string }) {
  // Duotone lock (SCOPE §11: icons, not emoji).
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2.5" className="fill-gold/30" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" className="fill-none stroke-gold" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="10" width="16" height="11" rx="2.5" className="fill-none stroke-gold" strokeWidth="2" />
      <circle cx="12" cy="15.5" r="1.6" className="fill-gold" />
    </svg>
  );
}
