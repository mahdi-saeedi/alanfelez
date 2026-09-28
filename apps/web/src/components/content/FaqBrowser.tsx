"use client";

import { useEffect, useMemo, useState } from "react";
import type { Schemas } from "@alanfelez/api-client";

type Category = Schemas["FaqCategory"];
type Labels = { search: string; searchLabel: string; all: string; popular: string; noResults: string; copyLink: string; copied: string };

/**
 * FAQ accordion (FAQ.docx requirements): collapsed by default, toggles without reload, search + category filter,
 * a «سوالات پر تکرار» block, and a shareable link per question (/faq#slug opens and scrolls to it).
 * Every question and answer is in the server-rendered HTML; filtering only hides items, so SEO sees them all.
 */
export function FaqBrowser({ categories, labels }: { categories: Category[]; labels: Labels }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string>();

  // Deep links: open the question in the URL hash, now and when the hash changes.
  useEffect(() => {
    const fromHash = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      if (!slug || !document.getElementById(slug)) return;
      setActive(undefined);
      setQuery("");
      setOpen((s) => new Set(s).add(slug));
      requestAnimationFrame(() => document.getElementById(slug)?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const q = normalize(query);
  const visible = useMemo(
    () =>
      categories
        .filter((c) => !active || c.slug === active)
        .map((c) => ({ ...c, items: c.items.filter((i) => !q || normalize(i.question + " " + stripTags(i.answer)).includes(q)) }))
        .filter((c) => c.items.length > 0),
    [categories, active, q],
  );
  const popular = categories.flatMap((c) => c.items.filter((i) => i.popular));

  const toggle = (slug: string, isOpen: boolean) => {
    setOpen((s) => {
      const next = new Set(s);
      if (isOpen) next.add(slug);
      else next.delete(slug);
      return next;
    });
  };
  const copy = async (slug: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${slug}`;
    history.replaceState(null, "", `#${slug}`);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      setTimeout(() => setCopied(undefined), 2000);
    } catch {
      /* clipboard blocked: the URL bar now has the link */
    }
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-md">
        <label className="relative block">
          <span className="sr-only">{labels.searchLabel}</span>
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.search}
            className="w-full rounded-card border border-border bg-surface py-3 ps-10 pe-4 text-sm shadow-soft outline-none focus:border-gold"
          />
        </label>
      </div>

      <nav className="flex flex-wrap justify-center gap-2">
        {[{ slug: undefined, name: labels.all }, ...categories].map((c) => {
          const on = c.slug === active;
          return (
            <button
              key={c.slug ?? "all"}
              type="button"
              onClick={() => setActive(c.slug)}
              aria-pressed={on}
              className={`rounded-full border px-3.5 py-1.5 text-xs sm:text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface text-text-2 hover:border-gold"}`}
            >
              {c.name}
            </button>
          );
        })}
      </nav>

      {!q && !active && popular.length > 0 && (
        <section className="rounded-card border border-gold/40 bg-gold/5 p-4">
          <h2 className="mb-3 text-sm font-bold">{labels.popular}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {popular.map((i) => (
              <li key={i.slug}>
                <a href={`#${i.slug}`} className="text-sm text-text-2 hover:text-gold-dark">{i.question}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visible.length === 0 && <p className="py-8 text-center text-text-2">{labels.noResults}</p>}

      {visible.map((c) => (
        <section key={c.slug} aria-labelledby={`cat-${c.slug}`}>
          <h2 id={`cat-${c.slug}`} className="mb-3 text-base font-extrabold">{c.name}</h2>
          <div className="space-y-2">
            {c.items.map((i) => (
              <details
                key={i.slug}
                id={i.slug}
                open={open.has(i.slug)}
                onToggle={(e) => toggle(i.slug, (e.currentTarget as HTMLDetailsElement).open)}
                className="group scroll-mt-24 rounded-card border border-border bg-surface shadow-soft open:border-gold/50"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                  <h3 className="flex-1 text-sm font-bold leading-7">{i.question}</h3>
                  <Chevron />
                </summary>
                <div className="border-t border-border px-4 py-3">
                  <div className="rich text-sm" dangerouslySetInnerHTML={{ __html: i.answer }} />
                  <button type="button" onClick={() => copy(i.slug)} className="mt-3 text-xs text-text-3 hover:text-gold-dark">
                    {copied === i.slug ? labels.copied : labels.copyLink}
                  </button>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// Search ignores Arabic/Persian letter variants, zero-width non-joiners and case.
function normalize(s: string): string {
  return s
    .replace(/[‌‏‎]/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3">
      <circle cx="11" cy="11" r="7" className="fill-none stroke-current" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 text-text-3 transition group-open:rotate-180">
      <path d="m6 9 6 6 6-6" className="fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
