import { defineRouting } from "next-intl/routing";

// Persian is the default and has no prefix (/); English lives under /en (SCOPE.md §3).
export const routing = defineRouting({
  locales: ["fa", "en"],
  defaultLocale: "fa",
  localePrefix: "as-needed",
  // "/" is always Persian; English only when the user picks it (no Accept-Language redirects, clearer for SEO).
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
