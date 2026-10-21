/**
 * Symbolic picture of a metal: an ingot in the metal's colour with its chemical symbol. Drawn inline (no image
 * request, nothing hosted abroad) and decorative only: the metal's name is always written next to it.
 * A metal added later in the admin, without an entry here, gets a neutral grey ingot without a symbol.
 */
type Look = { top: string; front: string; edge: string; ink: string; symbol?: string };

const LOOKS: Record<string, Look> = {
  aluminum: { top: "#eef1f4", front: "#c9ced6", edge: "#a3abb6", ink: "#3d4450", symbol: "Al" },
  copper: { top: "#e39a6c", front: "#b8693d", edge: "#8a4723", ink: "#fff7f0", symbol: "Cu" },
  brass: { top: "#ecd27a", front: "#c9a43a", edge: "#94741c", ink: "#3a2d06", symbol: "CuZn" },
  zinc: { top: "#d3dfe7", front: "#9fb3c2", edge: "#738898", ink: "#1f2c36", symbol: "Zn" },
  lead: { top: "#9aa0aa", front: "#6e7480", edge: "#4b505a", ink: "#f2f4f7", symbol: "Pb" },
  iron: { top: "#a59990", front: "#7a6f68", edge: "#564c46", ink: "#f7f3f0", symbol: "Fe" },
  "cast-iron": { top: "#767b83", front: "#4b4f55", edge: "#2f3236", ink: "#e9ebee", symbol: "FeC" },
};

const NEUTRAL: Look = { top: "#dfe2e6", front: "#b4bac2", edge: "#8d949d", ink: "#3d4450" };

export function MetalIcon({ slug, className = "h-10 w-10" }: { slug: string; className?: string }) {
  const look = LOOKS[slug] ?? NEUTRAL;
  const small = (look.symbol?.length ?? 0) > 2;
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <rect width="48" height="48" rx="10" className="fill-surface-2" />
      <polygon points="11,8 37,8 45,21 3,21" fill={look.top} />
      <polygon points="3,21 45,21 40,40 8,40" fill={look.front} />
      <polyline points="3,21 8,40 40,40 45,21" fill="none" stroke={look.edge} strokeWidth="1.2" strokeLinejoin="round" />
      <line x1="12" y1="11" x2="32" y2="11" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
      {look.symbol && (
        <text x="24" y={small ? 34 : 35.5} textAnchor="middle" fontSize={small ? 10 : 14} fontWeight="800" fill={look.ink} fontFamily="Vazirmatn, sans-serif">
          {look.symbol}
        </text>
      )}
    </svg>
  );
}
