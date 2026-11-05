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

// Where this tab's visit came from, kept for the visit (sessionStorage, not a cookie; gone when the tab closes): the
// referring site and campaign tags of the first page, sent again with every page so a member who signs up during
// the visit is credited to it (admin «تحلیل بازدید», client 2026-11-05).
const SOURCE_KEY = "af_src";
type Source = { ref?: string; utm?: string; campaign?: string };

function visitSource(params: URLSearchParams): { source: Source; landing: boolean } {
  try {
    const kept = sessionStorage.getItem(SOURCE_KEY);
    if (kept) return { source: JSON.parse(kept) as Source, landing: false };
    const external = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : "";
    const source: Source = {
      ...(external ? { ref: external.slice(0, 300) } : {}),
      ...(params.get("utm_source") ? { utm: params.get("utm_source")!.slice(0, 80) } : {}),
      ...(params.get("utm_campaign") ? { campaign: params.get("utm_campaign")!.slice(0, 80) } : {}),
    };
    sessionStorage.setItem(SOURCE_KEY, JSON.stringify(source));
    return { source, landing: true };
  } catch {
    return { source: {}, landing: false }; // storage blocked: the visit is still counted, its source isn't
  }
}

// The previous page of this tab (the section that sent a visitor to the plans page).
let previousPath = "";

function Beacon() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = new URLSearchParams(KEEP.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : []))).toString();

  useEffect(() => {
    const path = (query ? `${pathname}?${query}` : pathname).slice(0, 300);
    const view = newId();
    const { source, landing } = visitSource(params);
    const from = previousPath && previousPath !== path ? previousPath : undefined;
    previousPath = path;
    send({ path, ...(view ? { view } : {}), ...source, ...(landing ? { landing } : {}), ...(from ? { from } : {}) });
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
