// The metals' colours, shared by the ingot icon (MetalIcon) and the home hero card, which takes each metal's colour
// when it comes up (client, 2026-11-02). A plain module so server and client components can both import it.

/**
 * An ingot's colours, its chemical symbol, and for the dark home hero card `line` (chart and progress bar) and `glow`
 * (the halo behind the card). Distinct per metal so the switch from one to the next is plain (client, 2026-11-02):
 * aluminium silver, copper orange, zinc blue-grey, brass gold, lead grey, cast iron dark grey, iron rust.
 */
export type Look = {
  top: string; front: string; edge: string; ink: string; symbol?: string; line: string; glow?: string;
  /** The icon tile, light to deep, shaded from the top left to the bottom right; z = atomic number (alloys have none). */
  tile?: [string, string, string, string]; z?: number;
};

export const LOOKS: Record<string, Look> = {
  aluminum: { top: "#eef1f4", front: "#c9ced6", edge: "#a3abb6", ink: "#3d4450", symbol: "Al", line: "#e5e7eb", glow: "#c9ced6", tile: ["#ffffff", "#e3e7ec", "#b9c0c9", "#9aa3ae"], z: 13 },
  copper: { top: "#e39a6c", front: "#b8693d", edge: "#8a4723", ink: "#fff7f0", symbol: "Cu", line: "#f08a4b", glow: "#c2622f", tile: ["#ffd9bf", "#e39a6c", "#b8693d", "#7a3f1f"], z: 29 },
  brass: { top: "#ecd27a", front: "#c9a43a", edge: "#94741c", ink: "#3a2d06", symbol: "CuZn", line: "#facc15", glow: "#c9a43a", tile: ["#fff3bf", "#ecd27a", "#c9a43a", "#8a6a15"] },
  zinc: { top: "#d3dfe7", front: "#9fb3c2", edge: "#738898", ink: "#1f2c36", symbol: "Zn", line: "#93c5e8", glow: "#5f8fb3", tile: ["#f1f6fa", "#c9d8e3", "#9fb3c2", "#6d8394"], z: 30 },
  lead: { top: "#9aa0aa", front: "#6e7480", edge: "#4b505a", ink: "#f2f4f7", symbol: "Pb", line: "#a3a9b5", glow: "#4b505a", tile: ["#d9dde3", "#9aa0aa", "#6e7480", "#41454d"], z: 82 },
  iron: { top: "#a59990", front: "#7a6f68", edge: "#564c46", ink: "#f7f3f0", symbol: "Fe", line: "#c0644a", glow: "#7a3b2a", tile: ["#d6cbc3", "#a59990", "#7a6f68", "#4a403a"], z: 26 },
  "cast-iron": { top: "#767b83", front: "#4b4f55", edge: "#2f3236", ink: "#e9ebee", symbol: "FeC", line: "#7d8590", glow: "#2f3236", tile: ["#a9aeb5", "#6b7078", "#45494f", "#25282c"] },
};

export const NEUTRAL: Look = { top: "#dfe2e6", front: "#b4bac2", edge: "#8d949d", ink: "#3d4450", line: "#cbd5e1", tile: ["#f4f5f7", "#dfe2e6", "#b4bac2", "#8d949d"] };
