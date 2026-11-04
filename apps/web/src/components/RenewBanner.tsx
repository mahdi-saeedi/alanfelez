"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { RENEW_HIDE_COOKIE } from "./renew-cookie";

/**
 * «اشتراک شما … روز دیگر تمام می‌شود — تمدید» under the header (client, 2026-10-29), for a paid plan ending within 7
 * days with no renewal queued. × hides it until the user signs in again: it sets a session cookie, which the header
 * reads (no flash on the next page) and which logging in or out deletes. Also the "choose your SMS metals" notice
 * (client, 2026-11-04), with its own cookie.
 */
export function RenewBanner({ text, renew, hide, href, cookie = RENEW_HIDE_COOKIE }: {
  text: string;
  renew: string;
  hide: string;
  href: { pathname: string; query?: Record<string, string>; hash?: string };
  cookie?: string;
}) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <div role="status" className="border-t border-graphite-3 bg-gold/15">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm text-white">
        <span className="min-w-0 flex-1">{text}</span>
        <Link href={href} className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-graphite hover:bg-gold-light">{renew}</Link>
        <button
          type="button"
          aria-label={hide}
          title={hide}
          onClick={() => {
            document.cookie = `${cookie}=1; path=/; SameSite=Lax`;
            setShown(false);
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg leading-none text-silver-light hover:bg-graphite-2 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
