"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Counts each page view for the admin's daily visitor stats (no cookies; see /api/visit). */
export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const body = new Blob([JSON.stringify({ path: pathname })], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/visit", body)) {
      void fetch("/api/visit", { method: "POST", body, keepalive: true }).catch(() => undefined);
    }
  }, [pathname]);
  return null;
}
