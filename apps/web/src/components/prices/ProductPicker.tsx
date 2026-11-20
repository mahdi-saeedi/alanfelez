"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type PickerOption = { slug: string; label: string; cat: string; catLabel: string };

/** Persian and Arabic letters compare the same (ی/ي, ک/ك), case and half-spaces don't matter: «كابل» finds «کابل». */
function norm(s: string) {
  return s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The chart page's product field with a search (client, 2026-11-20: a metal now has a hundred products and more).
 * A button shows the chosen product; it opens a search box over all the metal's products (every category), and a pick
 * sets the form's `series` and `cat` and submits it, like the other selects. Without JavaScript the form keeps working
 * through the hidden `series` field and the category select.
 */
export function ProductPicker({ name, value, label, options, searchLabel, emptyLabel }: {
  name: string; value: string; label: string; options: PickerOption[]; searchLabel: string; emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const listId = useId();
  const current = options.find((o) => o.slug === value);
  const shown = useMemo(() => {
    const words = norm(q).split(" ").filter(Boolean);
    return words.length ? options.filter((o) => words.every((w) => norm(`${o.label} ${o.catLabel}`).includes(w))) : options;
  }, [q, options]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (o: PickerOption) => {
    const form = hidden.current?.form;
    if (!form || !hidden.current) return;
    hidden.current.value = o.slug;
    const cat = form.elements.namedItem("cat");
    if (cat instanceof HTMLSelectElement) cat.value = o.cat;
    setOpen(false);
    form.requestSubmit();
  };

  return (
    <div ref={box} className="relative col-span-2 flex min-w-0 max-w-full flex-col gap-1 text-xs text-text-2 sm:min-w-64">
      <span id={`${listId}-label`}>{label}</span>
      <input ref={hidden} type="hidden" name={name} defaultValue={value} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${listId}-label`}
        onClick={() => { setOpen((o) => !o); setQ(""); setActive(0); }}
        className="flex max-w-full items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2 text-start text-sm text-text"
      >
        <span className="truncate">{current?.label ?? "—"}</span>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-text-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 min-w-72 rounded-card border border-border bg-surface shadow-soft">
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) pick(shown[active]!); }
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder={searchLabel}
            aria-label={searchLabel}
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="w-full rounded-t-card border-b border-border bg-surface-2 px-3 py-2.5 text-sm text-text outline-none focus:border-gold"
          />
          <ul id={listId} role="listbox" aria-labelledby={`${listId}-label`} className="max-h-72 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-3 text-center text-sm text-text-3">{emptyLabel}</li>}
            {shown.map((o, i) => (
              <li
                key={o.slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.slug === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-gold/10" : ""} ${o.slug === value ? "font-bold text-gold-dark" : "text-text"}`}
              >
                <span className="block">{o.label}</span>
                <span className="block text-[11px] text-text-3">{o.catLabel}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
