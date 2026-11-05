import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { formatToman, type Locale } from "@alanfelez/ui/format";
import { api, unwrap } from "../api";

/**
 * The admin's search box (client, 2026-11-05): a mobile number, a name or company, an order id or an article title;
 * the matches open the customer's page, the order list or the article. Ctrl+K focuses it.
 */
export function GlobalSearch() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const res = useQuery({
    queryKey: ["admin", "search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => unwrap(await api.GET("/v1/admin/search", { params: { query: { q: debounced } } })),
  });
  const go = (to: string) => { setOpen(false); setQ(""); nav(to); };
  const r = res.data;
  const empty = r && !r.users.length && !r.orders.length && !r.articles.length;
  return (
    <div className="relative min-w-0 flex-1 md:max-w-md">
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm focus:border-gold focus:outline-none"
      />
      {open && debounced.length >= 2 && r && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {empty && <p className="p-3 text-sm text-text-3">{t("search.none")}</p>}
          {r.users.length > 0 && <Group title={t("search.users")} />}
          {r.users.map((u) => (
            <Row key={u.id} onClick={() => go(`/activity/${u.id}`)} main={u.name || u.mobile} sub={[u.mobile, u.company].filter(Boolean).join(" · ")} />
          ))}
          {r.orders.length > 0 && <Group title={t("search.orders")} />}
          {r.orders.map((o) => (
            <Row key={o.id} onClick={() => go(`/orders?q=${o.id}`)} main={`${t(`plan.${o.plan}`)} · ${formatToman(o.amount.amount, locale)}`} sub={`${o.mobile} · ${t(`orders.status.${o.status}`)}`} />
          ))}
          {r.articles.length > 0 && <Group title={t("search.articles")} />}
          {r.articles.map((a) => (
            <Row key={a.id} onClick={() => go(`/content/articles/${a.id}`)} main={a.title} sub={t(`articles.type.${a.type}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Group({ title }: { title: string }) {
  return <p className="border-t border-border bg-surface-2 px-3 py-1 text-[11px] font-bold text-text-3 first:border-0">{title}</p>;
}

function Row({ main, sub, onClick }: { main: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="block w-full px-3 py-2 text-start text-sm hover:bg-surface-2">
      <span className="block font-bold">{main}</span>
      {sub && <span className="block text-xs text-text-3" dir="auto">{sub}</span>}
    </button>
  );
}
