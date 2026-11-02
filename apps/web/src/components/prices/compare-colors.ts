/** Line colors of the comparison chart, one per compare slot (distinct from the up/down green and red). In a plain
 *  module because both the server page and the client chart use them. */
// The third was violet (#7c3aed), too close to the blue (client, 2026-11-02): now pink, so the four tell apart easily.
export const COMPARE_COLORS = ["#ea580c", "#2563eb", "#db2777", "#0d9488"] as const;
