import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatBp, formatDate, formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { api, canWritePrices, currentRoles, errorText, problemOf, unwrap } from "../api";
import { toMinor } from "../amount";
import { Badge, Button, Card, Input, Notice, Page, Td, Th } from "./ui";

type Series = Schemas["AdminSeries"];

/** Every series with its latest price, and a manual entry form per row (SCOPE §13 fallback). */
export function PricesPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const series = useQuery({ queryKey: ["admin", "series"], queryFn: async () => unwrap(await api.GET("/v1/admin/series")).items, refetchInterval: 15_000 });
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWritePrices(roles.data ?? []);

  return (
    <Page title={t("prices.title")} hint={t("prices.hint")}>
      {!writable && roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>}
      {series.isError && <Notice tone="error">{t("table.error")}</Notice>}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <Th>{t("prices.series")}</Th>
              <Th>{t("prices.latest")}</Th>
              <Th>{t("prices.at")}</Th>
              <Th>{t("prices.source")}</Th>
              {writable && <Th>{t("prices.new")}</Th>}
            </tr>
          </thead>
          <tbody>
            {series.isLoading && (
              <tr><Td>{t("table.loading")}</Td></tr>
            )}
            {series.data?.map((s) => (
              <tr key={s.slug} className="border-t border-border">
                <Td>
                  <div className="font-bold">{locale === "en" && s.productEn ? s.productEn : s.productFa}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-3" dir="ltr">
                    <code>{s.slug}</code>
                    {s.isBase && <Badge tone="gold">{t("prices.base")}</Badge>}
                    {!s.active && <Badge>{t("prices.inactive")}</Badge>}
                  </div>
                </Td>
                <Td className="font-bold tabular-nums">
                  {s.latestAmount ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue({ amount: s.latestAmount, currency: s.currency, unit: s.unit }, locale)}` : "—"}
                </Td>
                <Td className="text-xs text-text-2">{s.latestAt ? formatDate(s.latestAt, locale, true) : "—"}</Td>
                <Td className="text-xs text-text-2" >{s.latestSource ?? "—"}</Td>
                {writable && (
                  <Td>
                    <EntryForm series={s} />
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

function EntryForm({ series }: { series: Series }) {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string; jump?: boolean } | null>(null);

  const save = useMutation({
    mutationFn: async (force: boolean) => {
      const minor = toMinor(amount, series.currency);
      if (!minor) throw Object.assign(new Error(t("prices.invalid")), { problem: { code: "LOCAL" } });
      return unwrap(
        await api.POST("/v1/admin/prices", {
          body: { series: series.slug, amount: minor, force, ...(at ? { observedAt: new Date(at).toISOString() } : {}) },
        }),
      );
    },
    onSuccess: (p) => {
      setMsg({ tone: "ok", text: `${t("prices.saved")}${p.jumpBp !== undefined ? ` (${formatBp(p.jumpBp, locale)})` : ""}` });
      setAmount("");
      setAt("");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => {
      const p = problemOf(err);
      if (p?.code === "PRICE_JUMP") {
        const minor = toMinor(amount, series.currency);
        const prev = series.latestAmount ? BigInt(series.latestAmount) : 0n;
        const jump = minor && prev > 0n ? Number(((BigInt(minor) - prev) * 10_000n) / prev) : undefined;
        const detail = jump !== undefined ? t("prices.jumpDetail", { jump: formatBp(jump, locale), limit: formatBp(series.maxJumpBp, locale) }) : "";
        setMsg({ tone: "warn", text: `${t("prices.jumpTitle")}. ${detail}`, jump: true });
      } else setMsg({ tone: "error", text: errorText(err, t) });
    },
  });

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        save.mutate(false);
      }}
    >
      <Input
        inputMode="decimal"
        placeholder={series.currency === "USD" ? "$/ton" : "تومان/kg"}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-32 tabular-nums"
        dir="ltr"
        aria-label={t("prices.new")}
      />
      <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="w-48" title={t("prices.observedAt")} aria-label={t("prices.observedAt")} />
      <Button type="submit" disabled={save.isPending || !amount}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
      {msg && (
        <div className="basis-full">
          <Notice tone={msg.tone}>
            {msg.text}
            {msg.jump && (
              <span className="ms-2 inline-flex gap-2">
                <Button type="button" tone="gold" onClick={() => save.mutate(true)}>{t("prices.jumpConfirm")}</Button>
                <Button type="button" tone="ghost" onClick={() => setMsg(null)}>{t("common.cancel")}</Button>
              </span>
            )}
          </Notice>
        </div>
      )}
    </form>
  );
}
