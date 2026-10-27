import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { Link, useSearchParams } from "react-router";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canGrant, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Input, Notice, Page, Td, Th } from "./ui";

/** Users, searchable by mobile (Persian or Latin digits), name or id. Identities themselves live in Keycloak. */
export function UsersPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? ""); // ?q= from the visitor stats
  const list = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: async () => unwrap(await api.GET("/v1/admin/users", { params: { query: q ? { q } : {} } })).items,
  });
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const qc = useQueryClient();
  // Admin only: deletes the Keycloak account and the personal details; orders and payments stay, without a name.
  const remove = useMutation({
    mutationFn: async (id: string) => ensureOk(await api.DELETE("/v1/admin/users/{id}", { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  return (
    <Page title={t("users.title")} hint={t("users.hint")}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("users.search")} className="w-80" />
      {remove.isSuccess && <Notice tone="ok">{t("users.deleted")}</Notice>}
      {remove.isError && (
        <Notice tone="error">
          {errorText(remove.error, t, { CONFLICT: "users.deleteConflict", UPSTREAM_UNAVAILABLE: "users.deleteNotSetUp" })}
        </Notice>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("users.user")}</Th><Th>{t("account.name")}</Th><Th>{t("users.signup")}</Th><Th>{t("subs.plan")}</Th><Th>{t("users.lastSeen")}</Th><Th /></tr>
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
                <Td className="text-xs">
                  {u.activity || u.metals?.length || u.province ? (
                    <>
                      {u.activity && <div className="font-bold">{t(`signup.activity.${u.activity}`, u.activity)}</div>}
                      {u.metals?.length ? <div className="text-text-2">{u.metals.map((m) => t(`signup.metal.${m}`, m)).join(locale === "fa" ? "، " : ", ")}</div> : null}
                      {u.province && <div className="text-text-3">{u.province}</div>}
                    </>
                  ) : "—"}
                </Td>
                <Td>
                  <Badge tone={u.currentPlan === "gold" ? "gold" : u.currentPlan === "silver" ? "gray" : "gray"}>{t(`plan.${u.currentPlan}`)}</Badge>
                  {u.currentEndsAt && <div className="mt-1 text-xs text-text-3">{formatDate(u.currentEndsAt, locale)}</div>}
                  {u.deletedAt ? <Badge tone="red">{t("users.deletedBadge")}</Badge> : u.blocked && <Badge tone="red">{t("users.blocked")}</Badge>}
                </Td>
                <Td className="text-xs text-text-2">{formatDate(u.lastSeenAt, locale, true)}</Td>
                <Td>
                  <div className="flex gap-3 text-xs">
                    <Link to={`/subscriptions?user=${u.id}`} className="text-gold-dark hover:underline">{t("users.grant")}</Link>
                    <Link to={`/orders?user=${u.id}`} className="text-text-2 hover:underline">{t("users.orders")}</Link>
                    {!u.deletedAt && canGrant(roles.data ?? []) && (
                      <Button
                        type="button"
                        tone="danger"
                        disabled={remove.isPending}
                        onClick={() => window.confirm(t("users.deleteConfirm", { user: u.phone ?? u.username })) && remove.mutate(u.id)}
                      >
                        {t("users.delete")}
                      </Button>
                    )}
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
