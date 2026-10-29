"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Item = { kind: string; title: string; sub?: string; href: string };

/**
 * The search form with suggestions while typing (client, 2026-10-29). The «جستجو» button and Enter still open the
 * full results page; the list under the box is a shortcut (arrow keys + Enter, or a tap). Without JavaScript it's a
 * plain GET form. Suggestions marked `similar` are the closest names when nothing matched exactly.
 */
export function SearchBox({ q, labels }: { q: string; labels: { label: string; placeholder: string; submit: string; similar: string; kinds: Record<string, string> } }) {
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState(q);
  const [items, setItems] = useState<Item[]>([]);
  const [similar, setSimilar] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 2 || term === q) return setItems([]);
    const ctl = new AbortController();
    // Wait until typing pauses, so each keystroke doesn't send a request.
    const timer = setTimeout(() => {
      fetch(`/api/search?locale=${locale}&q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { items: Item[]; similar: boolean }) => {
          setItems(d.items);
          setSimilar(d.similar);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [text, q, locale]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const shown = open && items.length > 0;
  function onKey(e: React.KeyboardEvent) {
    if (!shown) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1 + (a < 0 ? 1 : 0))) % items.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      router.push(items[active]!.href);
    } else if (e.key === "Escape") setOpen(false);
  }

  return (
    <form ref={box} action={locale === "en" ? "/en/search" : "/search"} role="search" className="relative flex gap-2">
      <label className="sr-only" htmlFor={`${id}-q`}>{labels.label}</label>
      <input
        id={`${id}-q`}
        name="q"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setOpen(true)}
        autoFocus={!q}
        autoComplete="off"
        minLength={2}
        maxLength={80}
        placeholder={labels.placeholder}
        role="combobox"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        className="min-w-0 flex-1 rounded-control border border-border bg-surface px-4 py-3 text-base"
      />
      <button className="shrink-0 rounded-control bg-graphite px-5 text-sm font-bold text-white hover:bg-graphite-2">{labels.submit}</button>
      {shown && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-card border border-border bg-surface shadow-card">
          {similar && <p className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-text-2">{labels.similar}</p>}
          <ul id={`${id}-list`} role="listbox">
            {items.map((it, i) => (
              <li key={it.href + i} id={`${id}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => router.push(it.href)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-start ${i === active ? "bg-surface-2" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{it.title}</span>
                    {it.sub && <span className="block truncate text-xs text-text-2">{it.sub}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-text-3">{labels.kinds[it.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
