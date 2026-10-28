"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The site header, kept at the top while the page scrolls (client, 2026-10-28), and slimmer once the visitor has
 * scrolled (data-compact: the logo and padding shrink through `group-data-[compact]:` classes in Header).
 * Two thresholds so the header doesn't flicker when its own change of height moves the page.
 */
export function StickyHeader({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => setCompact((c) => (c ? window.scrollY > 20 : window.scrollY > 80));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header data-compact={compact || undefined} className="group sticky top-0 z-50 bg-graphite text-white shadow-[0_1px_0_rgb(0_0_0/0.15)] data-[compact]:shadow-card">
      {children}
    </header>
  );
}
