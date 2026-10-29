"use client";

import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

type Labels = { menu: string; account: string; plan: string; tickets: string; logout: string };

/**
 * The signed-in user's menu in the header (client, 2026-10-29): the name and plan badge open a small list with the
 * account, the subscription, tickets and «خروج». Closes on a choice, Escape, an outside click and navigation.
 * `logout` is the header's server action (it also ends the Keycloak session).
 */
export function AccountMenu({ name, tier, badgeClass, logout, labels }: { name: string; tier: string; badgeClass: string; logout: () => Promise<void>; labels: Labels }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full rounded-md px-3 py-2.5 text-start text-sm text-text hover:bg-surface-2";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${labels.menu}: ${name} · ${tier}`}
        className="flex items-center gap-2 rounded-lg px-1.5 py-2 text-sm text-silver-light hover:bg-graphite-2 hover:text-white sm:px-3"
      >
        <span className="hidden max-w-36 truncate sm:inline">{name}</span>
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${badgeClass}`}>{tier}</span>
        <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden fill="currentColor"><path d="M2 4l4 4 4-4z" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-50 mt-2 w-56 rounded-card border border-border bg-surface p-1.5 text-text shadow-card">
          <p className="truncate border-b border-border px-3 pb-2 pt-1 text-xs text-text-2 sm:hidden">{name}</p>
          <Link role="menuitem" href="/account" className={item}>{labels.account}</Link>
          <Link role="menuitem" href="/account#plan" className={item}>{labels.plan}</Link>
          <Link role="menuitem" href="/account#tickets" className={item}>{labels.tickets}</Link>
          <form action={logout} className="mt-1 border-t border-border pt-1">
            <button role="menuitem" className={`${item} text-down`}>{labels.logout}</button>
          </form>
        </div>
      )}
    </div>
  );
}
