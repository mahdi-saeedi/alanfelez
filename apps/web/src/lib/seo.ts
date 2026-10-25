import type { Metadata } from "next";
import { alternatesFor, englishEnabled } from "./site";

/**
 * Page metadata with canonical, hreflang (only when the English site is on) and Open Graph (NFR SEO-1).
 * `noindex` for personal pages (account, checkout); the layout adds noindex everywhere outside production.
 */
/** The default share picture (Telegram/WhatsApp previews), 1200×630, one per language. */
export function shareImage(locale: string) {
  return { url: `/og-${locale === "en" ? "en" : "fa"}.jpg`, width: 1200, height: 630 };
}

export async function seo(locale: string, path: string, m: { title?: string; description?: string; noindex?: boolean; type?: "website" | "article" }): Promise<Metadata> {
  const alternates = alternatesFor(locale, path, await englishEnabled());
  return {
    ...(m.title ? { title: m.title } : {}),
    ...(m.description ? { description: m.description } : {}),
    alternates,
    // A page's openGraph replaces the layout's as a whole, so the share picture is repeated here (pages may override it).
    openGraph: { ...(m.title ? { title: m.title } : {}), ...(m.description ? { description: m.description } : {}), url: alternates.canonical, type: m.type ?? "website", images: [shareImage(locale)] },
    ...(m.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
