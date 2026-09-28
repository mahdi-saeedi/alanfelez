import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, unwrap } from "../api";
import { Badge, Card, Input, Page, Td, Th } from "./ui";

/** Users, searchable by mobile (Persian or Latin digits), name or id. Identities themselves live in Keycloak. */
export function UsersPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: async () => unwrap(await api.GET("/v1/admin/users", { params: { query: q ? { q } : {} } })).items,
  });
  return (
    <Page title={t("users.title")} hint={t("users.hint")}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("users.search")} className="w-80" />
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("users.user")}</Th><Th>{t("account.name")}</Th><Th>{t("subs.plan")}</Th><Th>{t("users.lastSeen")}</Th><Th /></tr>
          </thead>
          <tbody>
            {list.data?.length === 0 && <tr><Td className="text-text-2">{t("table.empty")}</Td></tr>}
            {list.data?.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <Td>
                  <div dir="ltr" className="font-bold">{u.phone ?? u.username}</div>
                  <code className="text-xs text-text-3" dir="ltr">{u.id}</code>
                </Td>
                <Td>{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</Td>
                <Td>
                  <Badge tone={u.currentPlan === "gold" ? "gold" : u.currentPlan === "silver" ? "gray" : "gray"}>{t(`plan.${u.currentPlan}`)}</Badge>
                  {u.currentEndsAt && <div className="mt-1 text-xs text-text-3">{formatDate(u.currentEndsAt, locale)}</div>}
                  {u.blocked && <Badge tone="red">{t("users.blocked")}</Badge>}
                </Td>
                <Td className="text-xs text-text-2">{formatDate(u.lastSeenAt, locale, true)}</Td>
                <Td>
                  <div className="flex gap-3 text-xs">
                    <Link to={`/subscriptions?user=${u.id}`} className="text-gold-dark hover:underline">{t("users.grant")}</Link>
                    <Link to={`/orders?user=${u.id}`} className="text-text-2 hover:underline">{t("users.orders")}</Link>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
