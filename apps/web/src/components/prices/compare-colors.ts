/** Line colors of the comparison chart, one per compare slot (distinct from the up/down green and red). In a plain
 *  module because both the server page and the client chart use them. */
// The third was violet (#7c3aed), too close to the blue, and the first orange, too close to the pink (client, 2026-11-02):
// now golden yellow, blue, pink and teal, so the four tell apart easily.
export const COMPARE_COLORS = ["#ca8a04", "#2563eb", "#db2777", "#0d9488"] as const;
