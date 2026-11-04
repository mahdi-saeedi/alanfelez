import { useGetIdentity, useLogout, useTranslate, useSetLocale, useGetLocale } from "@refinedev/core";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { formatNumber } from "@alanfelez/ui/format";
import { api, unwrap } from "../api";

// Grouped menu. `badge` names a count from /v1/admin/support/summary.
type BadgeKey = "openTickets" | "newMessages" | "pendingCommunity" | "quarantined";

const NAV: { group: string; items: { to: string; key: string; badge?: BadgeKey }[] }[] = [
  {
    group: "nav.group.main",
    items: [{ to: "/", key: "nav.dashboard" }, { to: "/activity", key: "nav.activity" }, { to: "/visits", key: "nav.visits" }, { to: "/sms", key: "nav.sms" }],
  },
  {
    group: "nav.group.market",
    items: [
      { to: "/prices", key: "nav.prices" },
      { to: "/prices/bulk", key: "nav.bulk" },
      { to: "/prices/quarantine", key: "nav.quarantine", badge: "quarantined" },
      { to: "/catalog", key: "nav.catalog" },
      { to: "/auctions", key: "nav.auctions" },
      { to: "/sources", key: "nav.sources" },
    ],
  },
  {
    group: "nav.group.content",
    items: [
      { to: "/content/articles", key: "nav.articles" },
      { to: "/content/community", key: "nav.community", badge: "pendingCommunity" },
      { to: "/content/categories", key: "nav.categories" },
      { to: "/content/faq", key: "nav.faq" },
      { to: "/content/pages", key: "nav.pages" },
    ],
  },
  {
    group: "nav.group.support",
    items: [
      { to: "/support/tickets", key: "nav.tickets", badge: "openTickets" },
      { to: "/support/messages", key: "nav.messages", badge: "newMessages" },
    ],
  },
  {
    group: "nav.group.commerce",
    items: [
      { to: "/users", key: "nav.users" },
      { to: "/orders", key: "nav.orders" },
      { to: "/subscriptions", key: "nav.subscriptions" },
    ],
  },
  {
    group: "nav.group.settings",
    items: [
      { to: "/settings", key: "nav.settings" },
      { to: "/staff", key: "nav.staff" },
      { to: "/flags", key: "nav.flags" },
      { to: "/markets", key: "nav.markets" },
      { to: "/plans", key: "nav.plans" },
    ],
  },
];

export function Layout() {
  const t = useTranslate();
  const { mutate: logout } = useLogout();
  const { data: identity } = useGetIdentity<{ name?: string }>();
  const setLocale = useSetLocale();
  const locale = useGetLocale()();
  // Badge counts; refreshed every minute and after support actions.
  const summary = useQuery({
    queryKey: ["admin", "support-summary"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/support/summary", {})),
    refetchInterval: 60_000,
  });

  // Phones: the menu folds away behind a button and closes after a choice (client 2026-11-03).
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      {open && <button type="button" aria-label={t("nav.close")} onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-graphite/50 md:hidden" />}
      <aside className={`fixed inset-y-0 start-0 z-40 w-64 shrink-0 overflow-y-auto bg-graphite p-4 text-white transition-transform md:static md:w-60 md:translate-x-0! ${open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"}`}>
        <div className="mb-8 flex items-center gap-2 font-extrabold">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          {t("app.title")}
        </div>
        <nav className="grid gap-4">
          {NAV.map((g) => (
            <div key={g.group} className="grid gap-1">
              {g.group !== "nav.group.main" && <p className="px-3 text-[11px] font-bold text-silver">{t(g.group)}</p>}
              {g.items.map((n) => {
                const count = n.badge ? summary.data?.[n.badge] ?? 0 : 0;
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/" || n.to === "/prices"}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isActive ? "bg-gold font-bold text-graphite" : "text-silver-light hover:bg-graphite-2 hover:text-white"}`
                    }
                  >
                    {t(n.key)}
                    {count > 0 && <span className="rounded-full bg-down px-1.5 text-[11px] font-bold text-white tabular-nums">{formatNumber(count, locale === "en" ? "en" : "fa")}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-surface px-4 py-3 text-sm md:px-6">
          <button type="button" onClick={() => setOpen(true)} aria-label={t("nav.open")} aria-expanded={open}
            className="me-auto rounded-lg border border-border px-3 py-1.5 font-bold md:hidden">☰ {t("nav.menu")}</button>
          <span dir="ltr" className="hidden text-text-2 sm:inline">{identity?.name}</span>
          <button onClick={() => setLocale(locale === "fa" ? "en" : "fa")} className="rounded-lg border border-border px-3 py-1.5 hover:border-gold">
            {t("app.language")}
          </button>
          <button onClick={() => logout()} className="rounded-lg bg-graphite px-3 py-1.5 text-white hover:bg-graphite-2">
            {t("auth.logout")}
          </button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
