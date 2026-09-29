import type { Metadata } from "next";
import { alternatesFor, englishEnabled } from "./site";

/**
 * Page metadata with canonical, hreflang (only when the English site is on) and Open Graph (NFR SEO-1).
 * `noindex` for personal pages (account, checkout); the layout adds noindex everywhere outside production.
 */
export async function seo(locale: string, path: string, m: { title?: string; description?: string; noindex?: boolean; type?: "website" | "article" }): Promise<Metadata> {
  const alternates = alternatesFor(locale, path, await englishEnabled());
  return {
    ...(m.title ? { title: m.title } : {}),
    ...(m.description ? { description: m.description } : {}),
    alternates,
    openGraph: { ...(m.title ? { title: m.title } : {}), ...(m.description ? { description: m.description } : {}), url: alternates.canonical, type: m.type ?? "website" },
    ...(m.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
