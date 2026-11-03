"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Counts each page view for the admin's visitor stats and, for signed-in users, the admin «رفتار کاربران»: which
 * page (with its metal or price row from the query) and how long it was in view. No cookies (see /api/visit).
 * Each page view gets a random id made here, so the time in view can be added to it when the page is hidden or left.
 */
export function VisitBeacon() {
  // useSearchParams needs a Suspense boundary, or the whole page would render on the client only.
  return (
    <Suspense fallback={null}>
      <Beacon />
    </Suspense>
  );
}

// Only these query keys say what a page is about (metal, price row, compared charts, tabs). Anything else, such as a
// payment reference on the checkout result, is never sent.
const KEEP = ["metal", "series", "c1", "c2", "c3", "c4", "cat", "category", "type", "range", "view"];

function send(body: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  if (!navigator.sendBeacon?.("/api/visit", blob)) {
    void fetch("/api/visit", { method: "POST", body: blob, keepalive: true }).catch(() => undefined);
  }
}

function newId(): string | undefined {
  try {
    return crypto.randomUUID();
  } catch {
    return undefined; // an old browser: the visit is still counted, without the time in view
  }
}

function Beacon() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = new URLSearchParams(KEEP.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : []))).toString();

  useEffect(() => {
    const path = (query ? `${pathname}?${query}` : pathname).slice(0, 300);
    const view = newId();
    send(view ? { path, view } : { path });
    if (!view) return;

    // Time in view: counted while the page is visible, reported when it's hidden or left (at most 30 minutes a report).
    let shownAt = document.visibilityState === "visible" ? Date.now() : 0;
    const report = () => {
      if (!shownAt) return;
      const seconds = Math.round((Date.now() - shownAt) / 1000);
      shownAt = 0;
      if (seconds >= 1) send({ path, view, seconds: Math.min(seconds, 1800) });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") report();
      else if (!shownAt) shownAt = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", report);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", report);
      report(); // the user went to another page
    };
  }, [pathname, query]);
  return null;
}
