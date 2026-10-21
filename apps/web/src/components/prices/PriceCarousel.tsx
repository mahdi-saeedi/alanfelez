"use client";

import { useRef, type ReactNode } from "react";

/**
 * A row of cards that scrolls sideways (swipe on phones, arrow buttons from sm up). The scrolling stays inside the row,
 * so the page itself never gets wider than the screen. Works in RTL and LTR: "next" follows the reading direction.
 */
export function PriceCarousel({ children, prevLabel, nextLabel }: { children: ReactNode; prevLabel: string; nextLabel: string }) {
  const row = useRef<HTMLUListElement>(null);
  function move(step: 1 | -1) {
    const el = row.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: step * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  }
  const button = "hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gold-dark text-gold-dark hover:bg-gold hover:text-graphite sm:flex";
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => move(-1)} aria-label={prevLabel} className={button}>
        <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:rotate-180" aria-hidden><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <ul ref={row} className="flex min-w-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none]">
        {children}
      </ul>
      <button type="button" onClick={() => move(1)} aria-label={nextLabel} className={button}>
        <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:rotate-180" aria-hidden><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
