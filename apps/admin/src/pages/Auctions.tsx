import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, formatNumber, parseDecimal, type Locale } from "@alanfelez/ui/format";
import { api, canWritePrices, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Select, Td, Textarea, Th } from "./ui";

type Row = Schemas["AdminOfferingInput"];
type Result = { index: number; ok: boolean; inserted?: boolean; error?: string };

// Columns of a pasted table (tab- or comma-separated, same order as the IME report). Tonnes and Toman/kg,
// like the report; converted to kg and Rial for the API.
const COLUMNS = ["metal", "productFa", "producerFa", "offeredT", "baseToman", "demandT", "tradedT", "clearingToman"] as const;

const today = () => new Date(Date.now() + 3.5 * 3600_000).toISOString().slice(0, 10); // Tehran calendar day

/** IME daily offerings (SCOPE §7): enter or paste a day's session, correct rows, delete mistakes. editor/admin. */
export function AuctionsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ rows: Row[]; results: Result[]; parseErrors: string[] }>();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWritePrices(roles.data ?? []);
  const metals = useQuery({ queryKey: ["metals"], queryFn: async () => unwrap(await api.GET("/v1/metals", {})).items });
  const list = useQuery({
    queryKey: ["admin", "auctions", date],
    queryFn: async () => unwrap(await api.GET("/v1/admin/auctions", { params: { query: { date } } })),
  });
  const bulk = useMutation({
    mutationFn: async ({ rows, dryRun }: { rows: Row[]; dryRun: boolean }) => unwrap(await api.POST("/v1/admin/auctions/bulk", { body: { rows, dryRun } })),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => ensureOk(await api.DELETE("/v1/admin/auctions/{id}", { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "auctions"] }),
  });

  const check = async () => {
    const parsed = parseTable(text, date, (metals.data ?? []).map((m) => ({ slug: m.slug, name: m.name })));
    if (parsed.rows.length === 0) return setPreview({ ...parsed, results: [] });
    const res = await bulk.mutateAsync({ rows: parsed.rows, dryRun: true });
    setPreview({ ...parsed, results: res.results });
  };
  const save = async () => {
    if (!preview) return;
    await bulk.mutateAsync({ rows: preview.rows, dryRun: false });
    setPreview(undefined);
    setText("");
    qc.invalidateQueries({ queryKey: ["admin", "auctions"] });
  };
  const ok = preview && preview.results.length > 0 && preview.parseErrors.length === 0 && preview.results.every((r) => r.ok);
  const tons = (kg?: number) => (kg === undefined ? "—" : formatNumber(kg / 1000, locale));
  const toman = (rial?: number) => (rial === undefined ? "—" : formatNumber(rial / 10, locale));

  return (
    <Page title={t("ime.title")} hint={t("ime.hint")}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("ime.date")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {list.data && list.data.dates.length > 0 && (
          <Field label={t("ime.recent")}>
            <Select value="" onChange={(e) => e.target.value && setDate(e.target.value)}>
              <option value="">—</option>
              {list.data.dates.slice(0, 20).map((d) => <option key={d} value={d}>{formatDate(`${d}T12:00:00Z`, locale)}</option>)}
            </Select>
          </Field>
        )}
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <Th>{t("ime.metal")}</Th><Th>{t("ime.product")}</Th><Th>{t("ime.producer")}</Th><Th>{t("ime.offered")}</Th><Th>{t("ime.base")}</Th>
              <Th>{t("ime.demand")}</Th><Th>{t("ime.traded")}</Th><Th>{t("ime.clearing")}</Th><Th />
            </tr>
          </thead>
          <tbody>
            {list.data?.items.length === 0 && <tr><Td className="text-text-2">{t("table.empty")}</Td></tr>}
            {list.data?.items.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <Td className="text-xs" dir="ltr">{o.metal}</Td>
                <Td>{o.productFa}</Td>
                <Td>{o.producerFa} {o.source !== "manual" && <Badge>{o.source}</Badge>}</Td>
                <Td className="tabular-nums">{tons(o.offeredKg)}</Td>
                <Td className="tabular-nums">{toman(o.basePriceRial)}</Td>
                <Td className="tabular-nums">{tons(o.demandKg)}</Td>
                <Td className="tabular-nums">{tons(o.tradedKg)}</Td>
                <Td className="tabular-nums font-bold">{toman(o.clearingPriceRial)}</Td>
                <Td>
                  {writable && (
                    <Button tone="danger" disabled={remove.isPending} onClick={() => window.confirm(t("ime.deleteConfirm")) && remove.mutate(o.id)}>{t("faq.delete")}</Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {remove.isError && <Notice tone="error">{errorText(remove.error, t)}</Notice>}

      {writable ? (
        <Card className="space-y-3 p-4">
          <h2 className="font-bold">{t("ime.entryTitle")}</h2>
          <p className="text-xs text-text-2">{t("ime.entryHint")}</p>
          <code className="block rounded-lg bg-surface-2 px-3 py-2 text-xs" dir="ltr">{COLUMNS.join(", ")}</code>
          <Textarea dir="auto" rows={6} value={text} onChange={(e) => { setText(e.target.value); setPreview(undefined); }} placeholder={t("ime.example")} />
          <div className="flex gap-2">
            <Button tone="dark" disabled={!text.trim() || bulk.isPending} onClick={check}>{t("ime.check")}</Button>
            {ok && <Button tone="gold" disabled={bulk.isPending} onClick={save}>{t("ime.save", { n: preview.rows.length })}</Button>}
          </div>
          {bulk.isError && <Notice tone="error">{errorText(bulk.error, t)}</Notice>}
          {preview && (
            <ul className="space-y-1 text-sm">
              {preview.parseErrors.map((e) => <li key={e}><Notice tone="error">{e}</Notice></li>)}
              {preview.results.map((r) => (
                <li key={r.index} className={r.ok ? "text-up" : "text-down"}>
                  {t("ime.line", { n: r.index + 1 })}: {preview.rows[r.index]?.productFa} — {r.ok ? t("ime.lineOk") : r.error}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>
      )}
    </Page>
  );
}

/** Parses pasted rows. The metal may be its slug or its name as shown in the admin. */
function parseTable(text: string, date: string, metals: { slug: string; name: string }[]) {
  const rows: Row[] = [];
  const parseErrors: string[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const cells = line.split(line.includes("\t") ? "\t" : /[,،]/).map((c) => c.trim());
      if (cells.length < 5) {
        parseErrors.push(`${i + 1}: ${line}`);
        return;
      }
      const [metal, productFa, producerFa, offeredT, baseToman, demandT, tradedT, clearingToman] = cells;
      const m = metals.find((x) => x.slug === metal || x.name === metal);
      const num = (s?: string) => (s ? parseDecimal(s) : undefined);
      const kg = (s?: string) => (num(s) === undefined ? undefined : Math.round(num(s)! * 1000));
      const rial = (s?: string) => (num(s) === undefined ? undefined : Math.round(num(s)! * 10));
      rows.push({
        tradeDate: date, metal: m?.slug ?? metal ?? "", productFa: productFa ?? "", producerFa: producerFa ?? "",
        offeredKg: kg(offeredT) ?? 0, basePriceRial: rial(baseToman) ?? 0,
        ...(kg(demandT) !== undefined ? { demandKg: kg(demandT) } : {}),
        ...(kg(tradedT) !== undefined ? { tradedKg: kg(tradedT) } : {}),
        ...(rial(clearingToman) !== undefined ? { clearingPriceRial: rial(clearingToman) } : {}),
      });
    });
  return { rows, parseErrors };
}
