// The metals' colours, shared by the ingot icon (MetalIcon) and the home hero card, which takes each metal's colour
// when it comes up (client, 2026-11-02). A plain module so server and client components can both import it.

/** An ingot's colours, its chemical symbol, and `line`: the metal's chart colour on the dark home hero card. */
export type Look = { top: string; front: string; edge: string; ink: string; symbol?: string; line: string };

export const LOOKS: Record<string, Look> = {
  aluminum: { top: "#eef1f4", front: "#c9ced6", edge: "#a3abb6", ink: "#3d4450", symbol: "Al", line: "#e5e7eb" },
  copper: { top: "#e39a6c", front: "#b8693d", edge: "#8a4723", ink: "#fff7f0", symbol: "Cu", line: "#e39a6c" },
  brass: { top: "#ecd27a", front: "#c9a43a", edge: "#94741c", ink: "#3a2d06", symbol: "CuZn", line: "#ecd27a" },
  zinc: { top: "#d3dfe7", front: "#9fb3c2", edge: "#738898", ink: "#1f2c36", symbol: "Zn", line: "#bcd0dd" },
  lead: { top: "#9aa0aa", front: "#6e7480", edge: "#4b505a", ink: "#f2f4f7", symbol: "Pb", line: "#b7bcc6" },
  iron: { top: "#a59990", front: "#7a6f68", edge: "#564c46", ink: "#f7f3f0", symbol: "Fe", line: "#c9b8ad" },
  "cast-iron": { top: "#767b83", front: "#4b4f55", edge: "#2f3236", ink: "#e9ebee", symbol: "FeC", line: "#9aa1aa" },
};

export const NEUTRAL: Look = { top: "#dfe2e6", front: "#b4bac2", edge: "#8d949d", ink: "#3d4450", line: "#cbd5e1" };
