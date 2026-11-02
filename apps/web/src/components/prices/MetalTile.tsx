import { LOOKS, NEUTRAL } from "./metal-colors";

/**
 * The hero chart's metal picture only (client, 2026-11-02: the tiles are for the chart beside the slogan; everywhere
 * else keeps the ingot, MetalIcon). A metal as a periodic-table tile (option 2): brushed metal in the metal's colours, shaded softly
 * from the top left (light) to the bottom right (deep) with no hard edge, a soft highlight, the chemical symbol embossed
 * and the atomic number in the corner (alloys like brass and cast iron have none). Drawn inline (no image request,
 * nothing hosted abroad) and decorative only: the metal's name is always written next to it. A metal added later in
 * the admin, without an entry in metal-colors.ts, gets a neutral grey tile without a symbol.
 */
export function MetalTile({ slug, className = "h-10 w-10" }: { slug: string; className?: string }) {
  const look = LOOKS[slug] ?? NEUTRAL;
  const [hi, mid, low, deep] = look.tile ?? NEUTRAL.tile!;
  const small = (look.symbol?.length ?? 0) > 2;
  // Ids per metal: the same metal drawn twice on a page shares identical definitions, so a duplicate id is harmless.
  const id = (part: string) => `mi-${part}-${slug.replace(/[^a-z0-9-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id("base")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.45" stopColor={mid} />
          <stop offset="1" stopColor={low} />
        </linearGradient>
        <radialGradient id={id("light")} cx="0.15" cy="0.1" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("shade")} cx="0.95" cy="0.95" r="0.7">
          <stop offset="0" stopColor={deep} stopOpacity="0.55" />
          <stop offset="1" stopColor={deep} stopOpacity="0" />
        </radialGradient>
        <pattern id={id("brush")} width="48" height="1.6" patternUnits="userSpaceOnUse">
          <rect width="48" height="0.5" fill="#ffffff" opacity="0.07" />
        </pattern>
      </defs>
      <rect width="48" height="48" rx="10" fill={`url(#${id("base")})`} />
      <rect width="48" height="48" rx="10" fill={`url(#${id("shade")})`} />
      <rect width="48" height="48" rx="10" fill={`url(#${id("brush")})`} />
      <rect width="48" height="48" rx="10" fill={`url(#${id("light")})`} />
      <rect x="1" y="1" width="46" height="46" rx="9" fill="none" stroke="#ffffff" strokeOpacity="0.4" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="9.5" fill="none" stroke={deep} strokeOpacity="0.55" />
      {look.z && (
        <text x="5" y="10" direction="ltr" fontSize="6.5" fontWeight="700" fill={deep} fontFamily="Vazirmatn, sans-serif">{look.z}</text>
      )}
      {look.symbol && (
        <>
          <text x="24.7" y={small ? 31.7 : 33.7} textAnchor="middle" fontSize={small ? 12 : 19} fontWeight="900" fill="#000000" fillOpacity="0.2" fontFamily="Vazirmatn, sans-serif">{look.symbol}</text>
          <text x="24" y={small ? 31 : 33} textAnchor="middle" fontSize={small ? 12 : 19} fontWeight="900" fill={look.ink} fontFamily="Vazirmatn, sans-serif">{look.symbol}</text>
        </>
      )}
    </svg>
  );
}
