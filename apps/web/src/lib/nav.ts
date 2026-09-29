// The site's pages, shared by the desktop header (server) and the phone menu (client). A plain module: constants
// exported from a "use client" file reach server components only as client references.

/** Header nav on desktop; the first group of the phone menu. */
export const MAIN_NAV = [
  ["home", "/"],
  ["prices", "/prices"],
  ["chart", "/chart"],
  ["analysis", "/analysis"],
  ["auctions", "/auctions"],
  ["calculator", "/calculator"],
] as const;

/** The rest of the phone menu (on desktop they're in the footer). */
export const MORE_NAV = [
  ["plans", "/plans"],
  ["faq", "/faq"],
  ["about", "/about"],
  ["contact", "/contact"],
] as const;
