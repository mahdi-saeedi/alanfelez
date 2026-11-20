import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatBp, formatDate, formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { currentPricesCsv, decodeFile, parseCsv, planUpload, tehranDay, toCsv, type Skipped } from "./bulk-csv";
import { isZip, readXlsx } from "./xlsx";
import { Badge, Button, Card, Notice, Page, Td, Th } from "./ui";

type Result = Schemas["BulkPriceResult"];

/**
 * Bulk entry (SECURITY §6): parse in the browser → dry run shows the diff → the user confirms → store.
 * The daily file (client, 2026-11-15): «دانلود فایل قیمت‌های فعلی» gives every price row with its current price; the
 * new prices are written in «قیمت جدید», and an empty cell means unchanged today (saved again at the same price).
 * Amounts are in the series' input unit (Toman/kg or USD/ton), like the single-entry form.
 */
/** Rows per call to /v1/admin/prices/bulk (its maxItems). */
const BULK_CHUNK = 500;

export function BulkPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState(false);
  const [force, setForce] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [unchanged, setUnchanged] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<number | null>(null);
  const [series, setSeries] = useState<Map<string, Schemas["AdminSeries"]>>(new Map());

  const loadSeries = async () => {
    const list = unwrap(await api.GET("/v1/admin/series")).items;
    const bySlug = new Map(list.map((s) => [s.slug, s]));
    setSeries(bySlug);
    return bySlug;
  };

  const download = useMutation({
    mutationFn: async () => {
      const bySlug = await loadSeries();
      const csv = currentPricesCsv([...bySlug.values()], {
        metal: (m) => t(`signup.metal.${m}`, m),
        market: (m) => t(`bulk.market.${m}`, m),
        unit: (s) => t(s.currency === "USD" ? "bulk.unitUsd" : "bulk.unitToman"),
        date: (iso) => formatDate(iso, locale),
      });
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `alanfelez-prices-${tehranDay(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const bySlug = await loadSeries();
      const { planned, skipped: skip } = planUpload(parseCsv(text), bySlug);
      setSkipped(skip);
      setUnchanged(new Set(planned.filter((p) => p.unchanged).map((p) => p.series)));
      if (planned.length === 0) return { items: [] as Result[], stored: 0 };
      const items = planned.map((p) => ({ series: p.series, amount: p.amount, force, ...(p.observedAt ? { observedAt: p.observedAt } : {}) }));
      // The API takes at most BULK_CHUNK rows per call; a bigger file (a metal with 1,200 products, or every metal's daily
      // file) goes in parts, one after the other, with the row numbers kept (client, 2026-11-20).
      const all: Result[] = [];
      let stored = 0;
      for (let at = 0; at < items.length; at += BULK_CHUNK) {
        const res = unwrap(await api.POST("/v1/admin/prices/bulk", { body: { items: items.slice(at, at + BULK_CHUNK), dryRun } }));
        all.push(...res.items.map((r) => ({ ...r, index: r.index >= 0 ? r.index + at : r.index })));
        stored += res.stored;
      }
      return { items: all, stored };
    },
    onSuccess: (res, dryRun) => {
      setResults(res.items);
      setDone(dryRun ? null : res.stored);
      if (!dryRun) void qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const ready = (r: Result) => r.status === "ok" || (force && r.status === "jump");
  const okCount = results?.filter(ready).length ?? 0;
  const changedCount = results?.filter((r) => ready(r) && !unchanged.has(r.series)).length ?? 0;
  const sameCount = results?.filter((r) => ready(r) && unchanged.has(r.series)).length ?? 0;
  const reset = () => { setResults(null); setDone(null); setSkipped([]); };

  return (
    <Page title={t("bulk.title")} hint={t("bulk.hint")}>
      <Card className="space-y-2 p-4">
        <p className="text-sm font-bold">{t("bulk.dailyTitle")}</p>
        <ol className="list-decimal space-y-1 ps-5 text-sm text-text-2">
          <li>{t("bulk.step1")}</li><li>{t("bulk.step2")}</li><li>{t("bulk.step3")}</li><li>{t("bulk.step4")}</li>
        </ol>
        <Button tone="dark" onClick={() => download.mutate()} disabled={download.isPending}>{t("bulk.download")}</Button>
        {download.isError && <Notice tone="error">{errorText(download.error, t)}</Notice>}
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-gold">
          {t("bulk.file")}
          <input
            type="file"
            accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setFileError(false);
              if (f) {
                const bytes = await f.arrayBuffer();
                // An Excel file (.xlsx) as it is, or a CSV (client, 2026-11-18).
                if (isZip(bytes)) {
                  try {
                    setText(toCsv(await readXlsx(bytes)));
                  } catch {
                    setText("");
                    setFileError(true);
                  }
                } else setText(decodeFile(bytes));
                setFileName(f.name);
              }
              reset();
              e.target.value = "";
            }}
          />
        </label>
        {fileName && <span className="text-sm text-text-2" dir="ltr">{fileName}</span>}
        {fileError && <Notice tone="error">{t("bulk.fileError")}</Notice>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          {t("bulk.force")}
        </label>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-text-2">{t("bulk.textBox")}</summary>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName("");
            reset();
          }}
          rows={8}
          dir="ltr"
          placeholder={"copper-red-free,640000\nrebar-16-iron,34500\ncopper-lme,9800.50"}
          className="mt-2 w-full rounded-card border border-border bg-surface p-3 font-mono text-sm"
        />
      </details>
      <div className="flex gap-2">
        <Button onClick={() => run.mutate(true)} disabled={!text || run.isPending}>{t("bulk.preview")}</Button>
        {results && done === null && okCount > 0 && (
          <Button tone="gold" onClick={() => run.mutate(false)} disabled={run.isPending}>{t("bulk.store", { count: okCount })}</Button>
        )}
      </div>
      {run.isError && <Notice tone="error">{errorText(run.error, t)}</Notice>}
      {results && done === null && (
        <Notice tone="ok">{t("bulk.summary", { changed: changedCount, same: sameCount, skipped: skipped.length + results.length - okCount })}</Notice>
      )}
      {done !== null && <Notice tone="ok">{t("bulk.stored", { count: done })}</Notice>}
      {skipped.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold">{t("bulk.skippedTitle")}</p>
          <ul className="space-y-1 text-xs text-text-2">
            {skipped.map((k, i) => <li key={i}>{t(`bulk.skip.${k.reason}`)}: <span dir="auto">{k.text}</span></li>)}
          </ul>
        </Card>
      )}
      {results && results.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr><Th>{t("bulk.row")}</Th><Th>{t("prices.series")}</Th><Th>{t("bulk.status")}</Th><Th>{t("bulk.previous")}</Th><Th>{t("bulk.jump")}</Th><Th /></tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const same = unchanged.has(r.series) && (r.status === "ok" || r.status === "stored");
                  return (
                    <tr key={i} className="border-t border-border">
                      <Td className="tabular-nums">{r.index >= 0 ? r.index + 1 : "—"}</Td>
                      <Td>{series.get(r.series)?.productFa ?? ""} <code dir="ltr" className="text-xs text-text-3">{r.series || "—"}</code></Td>
                      <Td>
                        {same ? <Badge tone="gray">{t("bulk.status.same")}</Badge>
                          : <Badge tone={r.status === "ok" || r.status === "stored" ? "green" : r.status === "jump" ? "gold" : "red"}>{t(`bulk.status.${r.status}`)}</Badge>}
                      </Td>
                      <Td className="tabular-nums">{r.previousAmount ? previous(r.previousAmount, series.get(r.series), locale) : "—"}</Td>
                      <Td dir="ltr" className="tabular-nums">{r.jumpBp !== undefined ? formatBp(r.jumpBp, locale) : "—"}</Td>
                      <Td className="text-xs text-text-3">{r.status === "invalid" || r.status === "duplicate" ? r.message : ""}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Page>
  );
}

function previous(amount: string, s: Schemas["AdminSeries"] | undefined, locale: Locale): string {
  if (!s) return "—";
  return `${s.currency === "USD" ? "$" : ""}${formatPriceValue({ amount, currency: s.currency, unit: s.unit }, locale)}`;
}
