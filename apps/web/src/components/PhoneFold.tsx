"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

const KEY = "phoneFold.open";

/**
 * On phones (below sm) a button that shows or hides `children`; from sm up the children always show and the button
 * doesn't. Used for the chart page's compare cards, which otherwise push the page to twice its length on a phone.
 * Remembered for the tab (sessionStorage), so picking a chart, which reloads the page, doesn't fold it again.
 */
export function PhoneFold({ label, hideLabel, children }: { label: string; hideLabel: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "1") setOpen(true);
    } catch {}
  }, []);
  function toggle() {
    setOpen(!open);
    try {
      sessionStorage.setItem(KEY, open ? "0" : "1");
    } catch {}
  }
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-card border border-border bg-surface px-4 text-sm font-bold text-text shadow-soft sm:hidden"
      >
        {open ? hideLabel : label}
        <span aria-hidden className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      <div id={id} className={`${open ? "mt-3" : "hidden"} sm:mt-0 sm:block`}>
        {children}
      </div>
    </>
  );
}
