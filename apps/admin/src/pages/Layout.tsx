import { useGetIdentity, useLogout, useTranslate, useSetLocale, useGetLocale } from "@refinedev/core";
import { NavLink, Outlet } from "react-router";

const NAV = [
  { to: "/", key: "nav.dashboard" },
  { to: "/metals", key: "nav.metals" },
  { to: "/markets", key: "nav.markets" },
  { to: "/plans", key: "nav.plans" },
];

export function Layout() {
  const t = useTranslate();
  const { mutate: logout } = useLogout();
  const { data: identity } = useGetIdentity<{ name?: string }>();
  const setLocale = useSetLocale();
  const locale = useGetLocale()();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-graphite p-4 text-white">
        <div className="mb-8 flex items-center gap-2 font-extrabold">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          {t("app.title")}
        </div>
        <nav className="grid gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-gold font-bold text-graphite" : "text-silver-light hover:bg-graphite-2 hover:text-white"}`
              }
            >
              {t(n.key)}
            </NavLink>
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
