"use client";

import { useState, type ReactNode } from "react";

/**
 * A Gold auction card's longer details (place, organiser, notes) folded behind «جزئیات بیشتر» on phones, where they made
 * the list very long (client, 2026-10-31). From sm up they're always shown and the button isn't.
 */
export function PhoneDetails({ more, less, children }: { more: string; less: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`${open ? "" : "hidden"} space-y-1.5 sm:block`}>{children}</div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-h-9 text-sm font-bold text-gold-dark hover:underline sm:hidden">
        {open ? less : more}
      </button>
    </>
  );
}
