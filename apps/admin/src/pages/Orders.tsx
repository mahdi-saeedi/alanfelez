import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, formatToman, type Locale } from "@alanfelez/ui/format";
import { api, canGrant, currentRoles, errorText, unwrap } from "../api";
import { Badge, Button, Card, Input, Notice, Page, Td, Th } from "./ui";

type Filter = "all" | "paid" | "pending" | "failed" | "refunded" | "refund-requested";

/** Orders and refund requests. Deciding a refund is admin-only; the money is returned outside the system. */
export function OrdersPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const userId = params.get("user") ?? undefined; // from the Users page
  const [filter, setFilter] = useState<Filter>(userId ? "all" : "refund-requested");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const admin = canGrant(roles.data ?? []);
  const list = useQuery({
    queryKey: ["admin", "orders", filter, userId],
    queryFn: async () => {
      const query: { status?: Schemas["OrderStatus"]; refundStatus?: Schemas["RefundStatus"]; userId?: string } = { userId };
      if (filter === "refund-requested") query.refundStatus = "requested";
      else if (filter !== "all") query.status = filter;
      return unwrap(await api.GET("/v1/admin/orders", { params: { query } })).items;
    },
  });

  return (
    <Page title={t("orders.title")} hint={t("orders.hint")}>
      <div className="flex flex-wrap gap-1">
        {(["refund-requested", "all", "paid", "pending", "failed", "refunded"] as Filter[]).map((f) => (
          <Button key={f} tone={f === filter ? "dark" : "ghost"} onClick={() => setFilter(f)}>{t(`orders.filter.${f}`)}</Button>
        ))}
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <Th>{t("orders.date")}</Th><Th>{t("orders.user")}</Th><Th>{t("subs.plan")}</Th><Th>{t("orders.amount")}</Th>
              <Th>{t("sources.status")}</Th><Th>{t("orders.ref")}</Th><Th>{t("orders.refund")}</Th>
            </tr>
          </thead>
          <tbody>
            {list.data?.length === 0 && <tr><Td className="text-text-2">{t("table.empty")}</Td></tr>}
            {list.data?.map((o) => (
              <tr key={o.id} className="border-t border-border align-top">
                <Td className="text-xs">{formatDate(o.paidAt ?? o.createdAt, locale, true)}</Td>
                <Td><span dir="ltr">{o.username ?? o.userId.slice(0, 8)}</span></Td>
                <Td>
                  <Badge tone={o.plan === "gold" ? "gold" : "gray"}>{t(`plan.${o.plan}`)}</Badge>
                  <div className="mt-1 text-xs text-text-3">{t(`orders.period.${o.period}`)} · {t(`orders.kind.${o.kind}`)}</div>
                </Td>
                <Td className="tabular-nums">
                  {formatToman(o.amount.amount, locale)}
                  {o.credit.amount !== "0" && <div className="text-xs text-up">−{formatToman(o.credit.amount, locale)}</div>}
                </Td>
                <Td><Badge tone={o.status === "paid" ? "green" : o.status === "pending" ? "gold" : o.status === "refunded" ? "gray" : "red"}>{t(`orders.status.${o.status}`)}</Badge></Td>
                <Td className="text-xs" ><span dir="ltr">{o.gateway}{o.refId ? ` · ${o.refId}` : ""}</span></Td>
                <Td>
                  {o.refundStatus && (
                    <div className="space-y-2">
                      <Badge tone={o.refundStatus === "approved" ? "green" : o.refundStatus === "rejected" ? "red" : "gold"}>{t(`orders.refundStatus.${o.refundStatus}`)}</Badge>
                      {o.refundReason && <p className="max-w-xs text-xs text-text-2">{o.refundReason}</p>}
                      {o.refundStatus === "requested" && o.refundId && admin && (
                        <Decide refundId={o.refundId} onDone={() => qc.invalidateQueries({ queryKey: ["admin", "orders"] })} />
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {!admin && roles.isSuccess && <Notice tone="warn">{t("orders.adminOnly")}</Notice>}
    </Page>
  );
}

function Decide({ refundId, onDone }: { refundId: string; onDone: () => void }) {
  const t = useTranslate();
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: async (decision: "approve" | "reject") =>
      unwrap(await api.POST("/v1/admin/refunds/{id}/decision", { params: { path: { id: refundId } }, body: { decision, ...(note ? { note } : {}) } })),
    onSuccess: onDone,
  });
  return (
    <div className="space-y-2">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("orders.note")} className="w-56" />
      <div className="flex gap-2">
        <Button tone="gold" disabled={decide.isPending} onClick={() => decide.mutate("approve")}>{t("orders.approve")}</Button>
        <Button tone="danger" disabled={decide.isPending} onClick={() => decide.mutate("reject")}>{t("orders.reject")}</Button>
      </div>
      {decide.isError && <Notice tone="error">{errorText(decide.error, t)}</Notice>}
    </div>
  );
}
