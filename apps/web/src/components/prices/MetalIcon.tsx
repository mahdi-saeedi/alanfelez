import { LOOKS, NEUTRAL } from "./metal-colors";

/**
 * Symbolic picture of a metal: an ingot in the metal's colour with its chemical symbol. Drawn inline (no image
 * request, nothing hosted abroad) and decorative only: the metal's name is always written next to it.
 * A metal added later in the admin, without an entry here, gets a neutral grey ingot without a symbol.
 */
export function MetalIcon({ slug, className = "h-10 w-10" }: { slug: string; className?: string }) {
  const look = LOOKS[slug] ?? NEUTRAL;
  const small = (look.symbol?.length ?? 0) > 2;
  // Ids per metal: the same metal drawn twice on a page shares identical definitions, so a duplicate id is harmless.
  const id = (part: string) => `mi-${part}-${slug.replace(/[^a-z0-9-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      {/* Shaded from the top-left (north-west) light to the bottom-right (south-east) dark, with a glossy streak across
          (client, 2026-11-02: livelier than flat colour). */}
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={look.top} stopOpacity="0.35" />
          <stop offset="1" stopColor={look.edge} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={id("top")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.45" stopColor={look.top} />
          <stop offset="1" stopColor={look.front} />
        </linearGradient>
        <linearGradient id={id("front")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={look.top} />
          <stop offset="0.5" stopColor={look.front} />
          <stop offset="1" stopColor={look.edge} />
        </linearGradient>
        <linearGradient id={id("sheen")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <rect width="48" height="48" rx="10" />
        </clipPath>
      </defs>
      <rect width="48" height="48" rx="10" className="fill-surface-2" />
      <rect width="48" height="48" rx="10" fill={`url(#${id("bg")})`} />
      <polygon points="11,8 37,8 45,21 3,21" fill={`url(#${id("top")})`} />
      <polygon points="3,21 45,21 40,40 8,40" fill={`url(#${id("front")})`} />
      <polyline points="3,21 8,40 40,40 45,21" fill="none" stroke={look.edge} strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="12" y1="11" x2="32" y2="11" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
      {/* The reflection: a soft white band from top-left to bottom-right. */}
      <polygon points="6,0 18,0 0,30 0,14" fill={`url(#${id("sheen")})`} clipPath={`url(#${id("clip")})`} opacity="0.8" />
      {look.symbol && (
        <text x="24" y={small ? 34 : 35.5} textAnchor="middle" fontSize={small ? 10 : 14} fontWeight="800" fill={look.ink} fontFamily="Vazirmatn, sans-serif">
          {look.symbol}
        </text>
      )}
      <rect x="0.5" y="0.5" width="47" height="47" rx="9.5" fill="none" stroke={look.edge} strokeOpacity="0.35" />
    </svg>
  );
}
