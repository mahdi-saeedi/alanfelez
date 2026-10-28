"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { MAIN_NAV, MORE_NAV, isActive } from "@/lib/nav";

/**
 * Phone menu (below lg): a button that opens a drawer with every page. Closes on navigation, Escape and outside
 * click; focus moves into the drawer and back to the button, so it works with a keyboard and screen readers.
 */
/**
 * Desktop header nav (lg and up). Client only to read the current path: the page you're on is bold, white and
 * underlined in gold, so it's clear where you are.
 */
export function DesktopNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="main">
      {MAIN_NAV.map(([key, href]) => {
        const on = isActive(pathname, href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg border-b-2 px-3 py-2 text-sm ${on ? "border-gold bg-graphite-2 font-bold text-white" : "border-transparent text-silver-light hover:bg-graphite-2 hover:text-white"}`}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenu() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      button.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={t(open ? "close" : "menu")}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-2 text-silver-light hover:bg-graphite-2 hover:text-white lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          {open ? (
            <path d="M6 6l12 12M18 6 6 18" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button type="button" aria-label={t("close")} className="absolute inset-0 bg-graphite/60" onClick={() => setOpen(false)} />
          <div
            id="mobile-menu"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={t("menu")}
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto bg-graphite p-4 text-white shadow-card"
          >
            {[...MAIN_NAV, ...MORE_NAV].map(([key, href], i) => (
              <Link
                key={key}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2.5 text-sm ${i === MAIN_NAV.length ? "mt-3 border-t border-graphite-3 pt-4" : ""} ${isActive(pathname, href) ? "bg-gold font-bold text-graphite" : "text-silver-light hover:bg-graphite-2 hover:text-white"}`}
              >
                {t(key)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Duotone tab icons (SCOPE §11).
const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  prices: <path d="M4 19h16M7 16V9m5 7V5m5 11v-4" />,
  chart: <path d="M4 18 9 12l4 3 7-9" />,
  analysis: <path d="M6 4h9l3 3v13H6zM9 10h6M9 14h6" />,
  account: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
};

/** Phone tab bar (SCOPE §5): the five most used pages, fixed at the bottom below lg. */
export function BottomTabs() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const tabs = [["home", "/"], ["prices", "/prices"], ["chart", "/chart"], ["analysis", "/analysis"], ["account", "/account"]] as const;
  return (
    <nav aria-label={t("tabs")} className="fixed inset-x-0 bottom-0 z-40 border-t border-graphite-3 bg-graphite pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {tabs.map(([key, href]) => {
          const on = isActive(pathname, href);
          return (
            <li key={key}>
              <Link href={href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${on ? "font-bold text-gold-light" : "text-silver-light"}`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <g className={`fill-none stroke-current ${on ? "[&>path]:fill-gold/25" : ""}`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[key]}
                  </g>
                </svg>
                {t(key === "account" ? "accountShort" : `short.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
