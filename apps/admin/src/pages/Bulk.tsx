import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatBp, formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { normalizeDigits, toMinor } from "../amount";
import { Badge, Button, Card, Notice, Page, Td, Th } from "./ui";

type Input = Schemas["ManualPriceInput"];
type Result = Schemas["BulkPriceResult"];

/**
 * CSV bulk entry (SECURITY §6): parse in the browser → dry run shows the diff → the user confirms → store.
 * Amounts are in the series' input unit (Toman/kg or USD/ton), like the single-entry form.
 */
export function BulkPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [force, setForce] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [series, setSeries] = useState<Map<string, Schemas["AdminSeries"]>>(new Map());

  // Currency per slug comes from the series list (so "640000" means Toman for IRR, dollars for USD).
  const parse = async (): Promise<{ items: Input[]; bad: Result[] }> => {
    const list = unwrap(await api.GET("/v1/admin/series")).items;
    const bySlug = new Map(list.map((s) => [s.slug, s]));
    setSeries(bySlug);
    const items: Input[] = [];
    const bad: Result[] = [];
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !/^series\s*,/i.test(l))
      .forEach((line) => {
        const [slug = "", raw = "", when = ""] = line.split(/[,;\t]/).map((c) => c.trim());
        const cur = bySlug.get(slug)?.currency;
        const minor = cur ? toMinor(normalizeDigits(raw), cur) : null;
        if (!minor) {
          bad.push({ index: -1, series: slug, status: "invalid", message: line });
          return;
        }
        items.push({ series: slug, amount: minor, force, ...(when ? { observedAt: new Date(when).toISOString() } : {}) });
      });
    return { items, bad };
  };

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { items, bad } = await parse();
      if (items.length === 0) return { items: bad, stored: 0 };
      const res = unwrap(await api.POST("/v1/admin/prices/bulk", { body: { items, dryRun } }));
      return { items: [...res.items, ...bad], stored: res.stored };
    },
    onSuccess: (res, dryRun) => {
      setResults(res.items);
      setDone(dryRun ? null : res.stored);
      if (!dryRun) void qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const okCount = results?.filter((r) => r.status === "ok" || (force && r.status === "jump")).length ?? 0;

  return (
    <Page title={t("bulk.title")} hint={t("bulk.hint")}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-gold">
          {t("bulk.file")}
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
              setResults(null);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          {t("bulk.force")}
        </label>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResults(null);
        }}
        rows={8}
        dir="ltr"
        placeholder={"copper-red-free,640000\nrebar-16-iron,34500\ncopper-lme,9800.50"}
        className="w-full rounded-card border border-border bg-surface p-3 font-mono text-sm"
      />
      <div className="flex gap-2">
        <Button onClick={() => run.mutate(true)} disabled={!text || run.isPending}>{t("bulk.preview")}</Button>
        {results && done === null && okCount > 0 && (
          <Button tone="gold" onClick={() => run.mutate(false)} disabled={run.isPending}>{t("bulk.store", { count: okCount })}</Button>
        )}
      </div>
      {run.isError && <Notice tone="error">{errorText(run.error, t)}</Notice>}
      {done !== null && <Notice tone="ok">{t("bulk.stored", { count: done })}</Notice>}
      {results && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr><Th>{t("bulk.row")}</Th><Th>{t("prices.series")}</Th><Th>{t("bulk.status")}</Th><Th>{t("bulk.previous")}</Th><Th>{t("bulk.jump")}</Th><Th /></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <Td className="tabular-nums">{r.index >= 0 ? r.index + 1 : "—"}</Td>
                  <Td><code dir="ltr">{r.series || "—"}</code></Td>
                  <Td><Badge tone={r.status === "ok" || r.status === "stored" ? "green" : r.status === "jump" ? "gold" : "red"}>{t(`bulk.status.${r.status}`)}</Badge></Td>
                  <Td className="tabular-nums">{r.previousAmount ? previous(r.previousAmount, series.get(r.series), locale) : "—"}</Td>
                  <Td dir="ltr" className="tabular-nums">{r.jumpBp !== undefined ? formatBp(r.jumpBp, locale) : "—"}</Td>
                  <Td className="text-xs text-text-3">{r.status === "invalid" || r.status === "duplicate" ? r.message : ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Page>
  );
}

function previous(amount: string, s: Schemas["AdminSeries"] | undefined, locale: Locale): string {
  if (!s) return "—";
  return `${s.currency === "USD" ? "$" : ""}${formatPriceValue({ amount, currency: s.currency, unit: s.unit }, locale)}`;
}
