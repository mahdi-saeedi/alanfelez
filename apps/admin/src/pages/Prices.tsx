import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatBp, formatDate, formatPriceValue, type Locale } from "@alanfelez/ui/format";
import { api, canWritePrices, currentRoles, errorText, problemOf, unwrap } from "../api";
import { normalizeDigits, toMinor } from "../amount";
import { Badge, Button, Card, Input, Notice, Page, Select, Td, Th } from "./ui";
import { ObservedAtPicker } from "./ObservedAtPicker";

type Series = Schemas["AdminSeries"];

/**
 * Price management: every series with its latest price, unit, time and source; search and a metal filter; one
 * entry form per row, a table mode to enter many prices with one preview-then-save (the bulk endpoint), and per row
 * the history with "void" for a wrong entry. Rows are cards on a phone. Guide: docs/guides/PRICE_ADMIN.fa.md.
 */
export function PricesPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const series = useQuery({ queryKey: ["admin", "series"], queryFn: async () => unwrap(await api.GET("/v1/admin/series")).items, refetchInterval: 15_000 });
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWritePrices(roles.data ?? []);
  const [query, setQuery] = useState("");
  const [metal, setMetal] = useState("");
  const [table, setTable] = useState(false);
  const [history, setHistory] = useState<Series | null>(null);

  const metals = [...new Set((series.data ?? []).map((s) => s.metal).filter((m): m is string => !!m))];
  const q = normalizeDigits(query.trim().toLowerCase());
  const rows = (series.data ?? []).filter(
    (s) =>
      (!metal || s.metal === metal) &&
      (!q || s.slug.includes(q) || s.productFa.includes(query.trim()) || (s.productEn ?? "").toLowerCase().includes(q)),
  );

  return (
    <Page title={t("prices.title")} hint={t("prices.hint")}>
      {!writable && roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>}
      {series.isError && <Notice tone="error">{t("table.error")}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("prices.search")} aria-label={t("prices.search")} className="w-56" />
        <Select value={metal} onChange={(e) => setMetal(e.target.value)} aria-label={t("prices.metal")}>
          <option value="">{t("prices.allMetals")}</option>
          {metals.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
        {writable && (
          <span className="ms-auto inline-flex gap-1 rounded-lg border border-border p-0.5">
            <Button type="button" tone={table ? "ghost" : "dark"} onClick={() => setTable(false)}>{t("prices.modeRows")}</Button>
            <Button type="button" tone={table ? "dark" : "ghost"} onClick={() => setTable(true)}>{t("prices.modeTable")}</Button>
          </span>
        )}
      </div>
      {writable && <p className="text-xs text-text-3">{t("prices.smsNote")}</p>}
      {series.isLoading && <p className="text-sm text-text-2">{t("table.loading")}</p>}

      {table && writable ? (
        <TableEntry rows={rows.filter((s) => s.active)} />
      ) : (
        <>
          {/* desktop: a table */}
          <Card className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <Th>{t("prices.series")}</Th>
                  <Th>{t("prices.latest")}</Th>
                  <Th>{t("prices.at")}</Th>
                  <Th>{t("prices.source")}</Th>
                  {writable && <Th>{t("prices.new")}</Th>}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.slug} className="border-t border-border">
                    <Td><SeriesName series={s} /></Td>
                    <Td className="font-bold tabular-nums">{latestText(s, locale)}</Td>
                    <Td className="text-xs text-text-2">{s.latestAt ? formatDate(s.latestAt, locale, true) : "—"}</Td>
                    <Td className="text-xs text-text-2">{s.latestSource ?? "—"}</Td>
                    {writable && <Td>{s.active ? <EntryForm series={s} /> : null}</Td>}
                    <Td><Button type="button" tone="ghost" onClick={() => setHistory(s)}>{t("prices.history")}</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {/* phone: one card per series */}
          <ul className="grid gap-3 md:hidden">
            {rows.map((s) => (
              <li key={s.slug} className="space-y-2 rounded-card border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <SeriesName series={s} />
                  <Button type="button" tone="ghost" onClick={() => setHistory(s)}>{t("prices.history")}</Button>
                </div>
                <div className="text-lg font-extrabold tabular-nums">{latestText(s, locale)}</div>
                <div className="text-xs text-text-2">
                  {s.latestAt ? formatDate(s.latestAt, locale, true) : "—"} · {s.latestSource ?? "—"}
                </div>
                {writable && s.active && <EntryForm series={s} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {history && <HistoryDialog series={history} writable={writable} onClose={() => setHistory(null)} />}
    </Page>
  );
}

function latestText(s: Series, locale: Locale): string {
  return amountText(s, s.latestAmount, locale);
}

function amountText(s: Series, amount: string | undefined, locale: Locale): string {
  return amount ? `${s.currency === "USD" ? "$" : ""}${formatPriceValue({ amount, currency: s.currency, unit: s.unit }, locale)}` : "—";
}

function SeriesName({ series: s }: { series: Series }) {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  return (
    <div>
      <div className="font-bold">{locale === "en" && s.productEn ? s.productEn : s.productFa}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-3" dir="ltr">
        <code>{s.slug}</code>
        <span>{s.currency === "USD" ? "$/ton" : "Toman/kg"}</span>
        {s.isBase && <Badge tone="gold">{t("prices.base")}</Badge>}
        {!s.active && <Badge>{t("prices.inactive")}</Badge>}
      </div>
    </div>
  );
}

type BulkResult = Schemas["BulkPriceResult"];

/**
 * Many prices at once: type amounts in the rows you want to change, check (a dry run shows the previous price, the
 * change and any warning per row), then save. Rows with a jump are skipped unless "save them too" is ticked.
 */
function TableEntry({ rows }: { rows: Series[] }) {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [at, setAt] = useState("");
  const [force, setForce] = useState(false);
  const [results, setResults] = useState<Record<string, BulkResult> | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filled = rows.filter((s) => (values[s.slug] ?? "").trim() !== "");
  // With a past date chosen, show each row's price at that moment (not today's) next to the input.
  const pricesAt = useQuery({
    queryKey: ["admin", "prices-at", at],
    enabled: at !== "",
    queryFn: async () => {
      const res = unwrap(await api.GET("/v1/admin/prices/at", { params: { query: { at } } }));
      return Object.fromEntries(res.items.map((p) => [p.series, p.amount]));
    },
  });
  const run = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const items = filled.map((s) => {
        const minor = toMinor(values[s.slug]!, s.currency);
        return { series: s.slug, amount: minor ?? "0", force, ...(at ? { observedAt: at } : {}) };
      });
      return { dryRun, res: unwrap(await api.POST("/v1/admin/prices/bulk", { body: { items, dryRun } })) };
    },
    onMutate: () => {
      setError(null);
      setDone(null);
    },
    onSuccess: ({ dryRun, res }) => {
      const byRow: Record<string, BulkResult> = {};
      res.items.forEach((r) => (byRow[filled[r.index]!.slug] = r));
      setResults(byRow);
      if (!dryRun) {
        setDone(t("bulk.stored", { count: res.stored }));
        setValues((v) => Object.fromEntries(Object.entries(v).filter(([slug]) => byRow[slug]?.status !== "stored")));
        void qc.invalidateQueries({ queryKey: ["admin"] });
      }
    },
    onError: (err) => setError(errorText(err, t)),
  });
  const checked = results !== null && filled.every((s) => results[s.slug]);
  const ready = filled.filter((s) => results?.[s.slug]?.status === "ok" || (force && results?.[s.slug]?.status === "jump")).length;

  return (
    <div className="space-y-3">
      <Notice tone="warn">{t("prices.tableHint")}</Notice>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {t("prices.observedAt")}:
          <ObservedAtPicker value={at} locale={locale} onChange={(v) => { setAt(v); setResults(null); }} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          {t("bulk.force")}
        </label>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              <Th>{t("prices.series")}</Th>
              <Th>{at ? t("prices.priceAt") : t("prices.latest")}</Th>
              <Th>{t("prices.new")}</Th>
              <Th>{t("bulk.status")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const r = results?.[s.slug];
              const bad = (values[s.slug] ?? "").trim() !== "" && !toMinor(values[s.slug]!, s.currency);
              return (
                <tr key={s.slug} className="border-t border-border">
                  <Td><SeriesName series={s} /></Td>
                  <Td className="tabular-nums">{at ? amountText(s, pricesAt.data?.[s.slug], locale) : latestText(s, locale)}</Td>
                  <Td>
                    <Input
                      inputMode="decimal"
                      dir="ltr"
                      value={values[s.slug] ?? ""}
                      onChange={(e) => {
                        setValues((v) => ({ ...v, [s.slug]: e.target.value }));
                        setResults(null);
                      }}
                      placeholder={s.currency === "USD" ? "$/ton" : "تومان/kg"}
                      aria-label={`${t("prices.new")} ${s.productFa}`}
                      className={`w-36 tabular-nums ${bad ? "border-down" : ""}`}
                    />
                  </Td>
                  <Td className="text-xs">
                    {bad && <Badge tone="red">{t("prices.invalid")}</Badge>}
                    {r && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={r.status === "ok" || r.status === "stored" ? "green" : r.status === "jump" ? "gold" : "red"}>{t(`bulk.status.${r.status}`)}</Badge>
                        {r.jumpBp !== undefined && <span className="tabular-nums" dir="ltr">{formatBp(r.jumpBp, locale)}</span>}
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" tone="ghost" disabled={!filled.length || run.isPending} onClick={() => run.mutate(true)}>
          {t("prices.check", { count: filled.length })}
        </Button>
        <Button type="button" tone="gold" disabled={!checked || !ready || run.isPending} onClick={() => run.mutate(false)}>
          {run.isPending ? t("common.saving") : t("bulk.store", { count: ready })}
        </Button>
      </div>
    </div>
  );
}

type Point = Schemas["AdminPoint"];

/** The recent points of one series: when, how much, from what, who entered or voided it; "void" for a wrong one. */
function HistoryDialog({ series, writable, onClose }: { series: Series; writable: boolean; onClose: () => void }) {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const points = useQuery({
    queryKey: ["admin", "points", series.slug],
    queryFn: async () => unwrap(await api.GET("/v1/admin/series/{slug}/points", { params: { path: { slug: series.slug }, query: { limit: 100 } } })).items,
  });
  const voidIt = useMutation({
    mutationFn: async (v: { id: string; reason: string }) =>
      unwrap(await api.POST("/v1/admin/prices/{id}/void", { params: { path: { id: v.id } }, body: { reason: v.reason } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  const money = (amount: string) => `${series.currency === "USD" ? "$" : ""}${formatPriceValue({ amount, currency: series.currency, unit: series.unit }, locale)}`;
  const tone = (p: Point) => (p.status === "published" ? "green" : p.status === "quarantined" ? "gold" : "red");

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-graphite/50 sm:items-center" role="dialog" aria-modal="true" aria-label={t("prices.history")} onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-t-card bg-bg p-4 sm:rounded-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">{t("prices.history")}: {series.productFa}</h2>
            <p className="text-xs text-text-3">{t("prices.historyHint")}</p>
          </div>
          <Button type="button" tone="ghost" onClick={onClose}>{t("common.close")}</Button>
        </div>
        {voidIt.error && <Notice tone="error">{errorText(voidIt.error, t, { CONFLICT: "prices.voidConflict" })}</Notice>}
        {points.isLoading && <p className="text-sm">{t("table.loading")}</p>}
        <ul className="grid gap-2">
          {points.data?.map((p) => (
            <li key={p.id} className={`rounded-lg border border-border bg-surface p-3 text-sm ${p.status === "rejected" ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold tabular-nums">{money(p.amount)}</span>
                {p.previousAmount && (
                  <span className="text-xs text-text-3 tabular-nums">
                    {t("prices.from")} {money(p.previousAmount)}
                    {p.jumpBp !== undefined && <span dir="ltr"> ({formatBp(p.jumpBp, locale)})</span>}
                  </span>
                )}
                <Badge tone={tone(p)}>{t(`prices.status.${p.status}`)}</Badge>
                {writable && p.status === "published" && (
                  <Button
                    type="button"
                    tone="danger"
                    className="ms-auto"
                    disabled={voidIt.isPending}
                    onClick={() => {
                      const reason = window.prompt(t("prices.voidConfirm", { amount: money(p.amount) }), "");
                      if (reason !== null) voidIt.mutate({ id: p.id, reason });
                    }}
                  >
                    {t("prices.void")}
                  </Button>
                )}
              </div>
              <div className="mt-1 text-xs text-text-2">
                {formatDate(p.observedAt, locale, true)} · {p.isManual ? t("prices.manualBy", { name: p.enteredByName ?? "—" }) : p.source}
                {p.reviewedByName && p.status === "rejected" && <> · {t("prices.voidedBy", { name: p.reviewedByName })}</>}
              </div>
            </li>
          ))}
        </ul>
        {points.data?.length === 0 && <p className="text-sm text-text-2">{t("prices.noHistory")}</p>}
      </div>
    </div>
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
          body: { series: series.slug, amount: minor, force, ...(at ? { observedAt: at } : {}) },
        }),
      );
    },
    onSuccess: (p) => {
      setMsg({ tone: "ok", text: `${at ? t("prices.savedPast") : t("prices.saved")}${p.jumpBp !== undefined ? ` (${formatBp(p.jumpBp, locale)})` : ""}` });
      setAmount("");
      setAt("");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => {
      const p = problemOf(err);
      if (p?.code === "PRICE_JUMP") {
        const minor = toMinor(amount, series.currency);
        const prev = series.latestAmount ? BigInt(series.latestAmount) : 0n;
        const jump = !at && minor && prev > 0n ? Number(((BigInt(minor) - prev) * 10_000n) / prev) : undefined;
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
      <ObservedAtPicker value={at} locale={locale} onChange={setAt} />
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
