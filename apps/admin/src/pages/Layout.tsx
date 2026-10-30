import { useGetIdentity, useLogout, useTranslate, useSetLocale, useGetLocale } from "@refinedev/core";
import { NavLink, Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api";

// Grouped menu. `badge` names a count from /v1/admin/support/summary.
const NAV: { group: string; items: { to: string; key: string; badge?: "openTickets" | "newMessages" }[] }[] = [
  { group: "nav.group.main", items: [{ to: "/", key: "nav.dashboard" }, { to: "/visits", key: "nav.visits" }, { to: "/sms", key: "nav.sms" }] },
  {
    group: "nav.group.market",
    items: [
      { to: "/prices", key: "nav.prices" },
      { to: "/prices/bulk", key: "nav.bulk" },
      { to: "/prices/quarantine", key: "nav.quarantine" },
      { to: "/catalog", key: "nav.catalog" },
      { to: "/auctions", key: "nav.auctions" },
      { to: "/sources", key: "nav.sources" },
    ],
  },
  {
    group: "nav.group.content",
    items: [
      { to: "/content/articles", key: "nav.articles" },
      { to: "/content/community", key: "nav.community" },
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

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-graphite p-4 text-white">
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
                    {count > 0 && <span className="rounded-full bg-down px-1.5 text-[11px] font-bold text-white tabular-nums">{count}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-surface px-6 py-3 text-sm">
          <span dir="ltr" className="text-text-2">{identity?.name}</span>
          <button onClick={() => setLocale(locale === "fa" ? "en" : "fa")} className="rounded-lg border border-border px-3 py-1.5 hover:border-gold">
            {t("app.language")}
          </button>
          <button onClick={() => logout()} className="rounded-lg bg-graphite px-3 py-1.5 text-white hover:bg-graphite-2">
            {t("auth.logout")}
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
