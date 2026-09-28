import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { formatBp, formatDate, formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { api, canWritePrices, currentRoles, errorText, unwrap } from "../api";
import { Button, Card, Notice, Page, Td, Th } from "./ui";

/** Points held back by the outlier gate (SECURITY §6). Approving publishes; rejecting keeps them out for good. */
export function QuarantinePage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "quarantine"], queryFn: async () => unwrap(await api.GET("/v1/admin/prices/quarantine")).items, refetchInterval: 30_000 });
  const series = useQuery({ queryKey: ["admin", "series"], queryFn: async () => unwrap(await api.GET("/v1/admin/series")).items });
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWritePrices(roles.data ?? []);
  const review = useMutation({
    mutationFn: async (v: { id: string; decision: "approve" | "reject" }) =>
      unwrap(await api.POST("/v1/admin/prices/{id}/review", { params: { path: { id: v.id } }, body: { decision: v.decision } })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  const fmt = (slug: string, amount: string) => {
    const s = series.data?.find((x) => x.slug === slug);
    return s ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue({ amount, currency: s.currency, unit: s.unit }, locale)}` : amount;
  };

  return (
    <Page title={t("quarantine.title")} hint={t("quarantine.hint")}>
      {!writable && roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>}
      {review.isError && <Notice tone="error">{errorText(review.error, t)}</Notice>}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("prices.series")}</Th><Th>{t("bulk.previous")}</Th><Th>{t("prices.new")}</Th><Th>{t("bulk.jump")}</Th><Th>{t("prices.at")}</Th><Th>{t("prices.source")}</Th>{writable && <Th />}</tr>
          </thead>
          <tbody>
            {list.data?.length === 0 && <tr><Td className="text-text-2">{t("quarantine.empty")}</Td></tr>}
            {list.data?.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <Td><code dir="ltr">{p.series}</code></Td>
                <Td className="tabular-nums">{p.previousAmount ? fmt(p.series, p.previousAmount) : "—"}</Td>
                <Td className="font-bold tabular-nums">{fmt(p.series, p.amount)}</Td>
                <Td dir="ltr" className="tabular-nums text-down">{p.jumpBp !== undefined ? formatBp(p.jumpBp, locale) : "—"}</Td>
                <Td className="text-xs text-text-2">{formatDate(p.observedAt, locale, true)}</Td>
                <Td className="text-xs">{p.source}</Td>
                {writable && (
                  <Td>
                    <div className="flex gap-2">
                      <Button tone="gold" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, decision: "approve" })}>{t("quarantine.approve")}</Button>
                      <Button tone="danger" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, decision: "reject" })}>{t("quarantine.reject")}</Button>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
