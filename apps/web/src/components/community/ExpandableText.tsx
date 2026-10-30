"use client";

import { useState } from "react";

/** A member's text: the first lines, with «ادامه» to read it all. Line breaks are kept (the API sends plain text). */
export function ExpandableText({ text, more, less }: { text: string; more: string; less: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280 || text.split("\n").length > 4;
  return (
    <div className="text-sm leading-7 text-text-2">
      <p className={`whitespace-pre-line ${open || !long ? "" : "line-clamp-4"}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 min-h-8 text-xs font-bold text-info hover:underline">
          {open ? less : more}
        </button>
      )}
    </div>
  );
}
