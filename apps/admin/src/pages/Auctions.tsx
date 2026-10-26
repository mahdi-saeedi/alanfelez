import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { JALALI_MONTHS, jalaliInTehran, jalaliMonthDays, tehranToUTC } from "@alanfelez/ui/jalali";
import { api, canWritePrices, currentRoles, ensureOk, errorText, unwrap } from "../api";
import { Badge, Button, Card, Field, Input, Notice, Page, Select, Textarea } from "./ui";

type Auction = Schemas["AdminAuction"];
type AuctionInput = Schemas["AdminAuctionInput"];
type Status = Schemas["AuctionStatus"];

const CATEGORIES: Schemas["AuctionCategory"][] = ["intermediate", "scrap", "raw"];
const UNITS: Schemas["AuctionUnit"][] = ["ton", "kg", "piece"];
const STATUSES: Status[] = ["open", "paused", "closed"];
const STATUS_TONE = { open: "green", paused: "gold", closed: "gray" } as const;
const MAX_PDF = 10 << 20;

/**
 * Metal auctions («مزایدات», client 2026-10-26): add, edit, set the status, attach the PDF notice, delete. editor/admin.
 * On the site everyone sees the title, metal, category, quantity and status; the rest is Gold.
 */
export function AuctionsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | "">("");
  const [editing, setEditing] = useState<Auction | "new">();
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canWritePrices(roles.data ?? []);
  const metals = useQuery({ queryKey: ["metals"], queryFn: async () => unwrap(await api.GET("/v1/metals", {})).items });
  const list = useQuery({
    queryKey: ["admin", "auctions", status],
    queryFn: async () => unwrap(await api.GET("/v1/admin/auctions", { params: { query: { status: status || undefined, limit: 100 } } })),
  });
  const metalName = (slug: string) => metals.data?.find((m) => m.slug === slug)?.name ?? slug;
  const done = () => {
    setEditing(undefined);
    qc.invalidateQueries({ queryKey: ["admin", "auctions"] });
  };

  return (
    <Page title={t("auctions.title")} hint={t("auctions.hint")}>
      <div className="flex flex-wrap items-center gap-2">
        {writable && <Button tone="gold" onClick={() => setEditing("new")}>{t("auctions.new")}</Button>}
        <span className="ms-auto flex flex-wrap gap-1" role="group" aria-label={t("auctions.status")}>
          {(["", ...STATUSES] as const).map((s) => (
            <Button key={s || "all"} type="button" tone={status === s ? "dark" : "ghost"} onClick={() => setStatus(s)}>
              {s ? t(`auctions.statuses.${s}`) : t("auctions.all")}
            </Button>
          ))}
        </span>
      </div>
      {editing === "new" && <AuctionForm key="new" metals={metals.data ?? []} writable={writable} locale={locale} onDone={done} />}
      {list.isError && <Notice tone="error">{errorText(list.error, t)}</Notice>}
      <Card>
        {list.data && list.data.items.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-3">{t("auctions.empty")}</p>}
        <ul className="divide-y divide-border">
          {list.data?.items.map((a) => (
            <li key={a.id}>
              {editing !== "new" && editing?.id === a.id ? (
                <div className="p-2"><AuctionForm key={a.id} item={a} metals={metals.data ?? []} writable={writable} locale={locale} onDone={done} /></div>
              ) : (
                <button type="button" onClick={() => setEditing(a)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-start text-sm hover:bg-surface-2">
                  <span className="min-w-0 flex-1 font-bold">{a.titleFa}</span>
                  <span className="text-text-2">{metalName(a.metal)} · {t(`auctions.categories.${a.category}`)}</span>
                  <span className="tabular-nums">{formatNumber(a.quantity, locale)} {t(`auctions.units.${a.unit}`)}</span>
                  {a.deadlineAt && <span className="text-xs text-text-3">{t("auctions.deadline")}: {formatDate(a.deadlineAt, locale, true)}</span>}
                  {a.pdfName && <Badge tone="gold">PDF</Badge>}
                  <Badge tone={STATUS_TONE[a.status]}>{t(`auctions.statuses.${a.status}`)}</Badge>
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}

function AuctionForm({ item, metals, writable, locale, onDone }: {
  item?: Auction; metals: Schemas["Metal"][]; writable: boolean; locale: Locale; onDone: () => void;
}) {
  const t = useTranslate();
  const [v, setV] = useState<AuctionInput>(
    item ?? { titleFa: "", metal: metals[0]?.slug ?? "", category: "scrap", quantity: 1, unit: "ton", status: "open" },
  );
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState("");
  const set = <K extends keyof AuctionInput>(k: K, value: AuctionInput[K]) => setV((s) => ({ ...s, [k]: value }));
  const text = (k: keyof AuctionInput) => (v[k] as string | undefined) ?? "";

  const save = useMutation({
    mutationFn: async () => {
      // Empty optional texts are sent as "absent" (the API stores NULL).
      const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== undefined && x !== null)) as AuctionInput;
      let id = item?.id;
      if (item) ensureOk(await api.PUT("/v1/admin/auctions/{id}", { params: { path: { id: item.id } }, body }));
      else id = unwrap(await api.POST("/v1/admin/auctions", { body })).id;
      if (file && id) await uploadPdf(id, file);
    },
    onSuccess: onDone,
  });
  const remove = useMutation({
    mutationFn: async () => ensureOk(await api.DELETE("/v1/admin/auctions/{id}", { params: { path: { id: item!.id } } })),
    onSuccess: onDone,
  });
  const removePdf = useMutation({
    mutationFn: async () => ensureOk(await api.DELETE("/v1/admin/auctions/{id}/pdf", { params: { path: { id: item!.id } } })),
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4 rounded-card border border-gold/50 bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label={t("auctions.f.titleFa")}>
        <Input required minLength={2} maxLength={200} value={v.titleFa} onChange={(e) => set("titleFa", e.target.value)} className="w-full" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("auctions.f.metal")}>
          <Select value={v.metal} onChange={(e) => set("metal", e.target.value)} className="w-full">
            {metals.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label={t("auctions.f.category")}>
          <Select value={v.category} onChange={(e) => set("category", e.target.value as AuctionInput["category"])} className="w-full">
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`auctions.categories.${c}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("auctions.f.quantity")}>
          <span className="flex gap-2">
            <Input required type="number" min={1} max={1_000_000_000} step={1} value={v.quantity} dir="ltr"
              onChange={(e) => set("quantity", Number(e.target.value))} className="w-full" />
            <Select value={v.unit} onChange={(e) => set("unit", e.target.value as AuctionInput["unit"])} aria-label={t("auctions.f.unit")}>
              {UNITS.map((u) => <option key={u} value={u}>{t(`auctions.units.${u}`)}</option>)}
            </Select>
          </span>
        </Field>
        <Field label={t("auctions.status")}>
          <Select value={v.status} onChange={(e) => set("status", e.target.value as Status)} className="w-full">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`auctions.statuses.${s}`)}</option>)}
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-dashed border-gold/60 p-3">
        <legend className="px-1 text-xs font-bold text-gold-dark">{t("auctions.goldOnly")}</legend>
        <Field plain label={t("auctions.deadline")}>
          <DeadlinePicker value={v.deadlineAt ?? ""} onChange={(iso) => set("deadlineAt", iso || undefined)} locale={locale} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("auctions.f.locationFa")}><Input maxLength={200} value={text("locationFa")} onChange={(e) => set("locationFa", e.target.value)} className="w-full" /></Field>
          <Field label={t("auctions.f.organizerFa")}><Input maxLength={200} value={text("organizerFa")} onChange={(e) => set("organizerFa", e.target.value)} className="w-full" /></Field>
        </div>
        <Field label={t("auctions.f.detailsFa")}>
          <Textarea rows={5} maxLength={5000} value={text("detailsFa")} onChange={(e) => set("detailsFa", e.target.value)} />
        </Field>
        <Field plain label={t("auctions.f.pdf")} hint={t("auctions.f.pdfHint")}>
          {item?.pdfName && !file && (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span dir="auto">{item.pdfName}</span>
              <span className="text-xs text-text-3 tabular-nums">({formatNumber(Math.ceil((item.pdfSize ?? 0) / 1024), locale)} KB)</span>
              <Button type="button" tone="ghost" onClick={() => openPdf(item.id)}>{t("auctions.f.pdfView")}</Button>
              {writable && (
                <Button type="button" tone="danger" disabled={removePdf.isPending} onClick={() => window.confirm(t("auctions.f.pdfRemoveConfirm")) && removePdf.mutate()}>
                  {t("auctions.f.pdfRemove")}
                </Button>
              )}
            </span>
          )}
          {writable && (
            <input type="file" accept="application/pdf,.pdf" aria-label={t("auctions.f.pdf")} className="block text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileError(f && f.size > MAX_PDF ? t("auctions.f.pdfTooBig") : "");
                setFile(f && f.size <= MAX_PDF ? f : undefined);
              }} />
          )}
          {fileError && <span className="block text-sm text-down">{fileError}</span>}
        </Field>
      </fieldset>

      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm font-bold">{t("auctions.english")}</summary>
        <div dir="ltr" className="mt-3 space-y-4">
          <Field label="Title"><Input maxLength={200} value={text("titleEn")} onChange={(e) => set("titleEn", e.target.value)} className="w-full" /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Place"><Input maxLength={200} value={text("locationEn")} onChange={(e) => set("locationEn", e.target.value)} className="w-full" /></Field>
            <Field label="Organiser"><Input maxLength={200} value={text("organizerEn")} onChange={(e) => set("organizerEn", e.target.value)} className="w-full" /></Field>
          </div>
          <Field label="Details"><Textarea rows={4} maxLength={5000} value={text("detailsEn")} onChange={(e) => set("detailsEn", e.target.value)} /></Field>
        </div>
      </details>

      {(save.isError || remove.isError || removePdf.isError) && <Notice tone="error">{errorText(save.error ?? remove.error ?? removePdf.error, t)}</Notice>}
      <div className="flex flex-wrap gap-2">
        {writable && <Button tone="gold" type="submit" disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>}
        <Button type="button" tone="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        {writable && item && (
          <Button type="button" tone="danger" className="ms-auto" disabled={remove.isPending} onClick={() => window.confirm(t("auctions.deleteConfirm")) && remove.mutate()}>
            {t("auctions.delete")}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Uploads the PDF notice as the raw request body (the API checks it's a PDF of at most 10 MB). */
async function uploadPdf(id: string, file: File) {
  ensureOk(
    await api.PUT("/v1/admin/auctions/{id}/pdf", {
      params: { path: { id }, query: { fileName: file.name } },
      body: file as unknown as string,
      bodySerializer: (b: unknown) => b as BodyInit,
      headers: { "Content-Type": "application/pdf" },
    }),
  );
}

/** Opens the stored PDF in a new tab (fetched with the staff token, so it can't be a plain link). */
async function openPdf(id: string) {
  const tab = window.open("", "_blank");
  const res = await api.GET("/v1/admin/auctions/{id}/pdf", { params: { path: { id } }, parseAs: "blob" });
  if (res.data && tab) tab.location.href = URL.createObjectURL(res.data as Blob);
  else tab?.close();
}

/**
 * The participation deadline, or none. In Persian a Jalali day and a Tehran time (this year and the next two);
 * in English a plain date-time field. `value` is "" or a UTC ISO string.
 */
function DeadlinePicker({ value, onChange, locale }: { value: string; onChange: (iso: string) => void; locale: Locale }) {
  const t = useTranslate();
  if (!value) {
    return (
      <span className="flex items-center gap-2 text-sm">
        {t("auctions.noDeadline")}
        <Button type="button" tone="ghost" onClick={() => { const n = jalaliInTehran(new Date(Date.now() + 7 * 86_400_000)); onChange(tehranToUTC(n, 14, 0)); }}>
          {t("auctions.setDeadline")}
        </Button>
      </span>
    );
  }
  const clear = <Button type="button" tone="ghost" onClick={() => onChange("")}>{t("auctions.clearDeadline")}</Button>;
  if (locale !== "fa") {
    const d = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Input type="datetime-local" value={local} onChange={(e) => e.target.value && onChange(new Date(e.target.value).toISOString())} className="w-52" />
        {clear}
      </span>
    );
  }
  const cur = jalaliInTehran(new Date(value));
  const thisYear = jalaliInTehran().year;
  const set = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    next.day = Math.min(next.day, jalaliMonthDays(next.year, next.month));
    onChange(tehranToUTC(next, next.hour, next.minute));
  };
  const fa = (n: number) => n.toLocaleString("fa-IR", { useGrouping: false });
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2].filter((y) => y >= Math.min(cur.year, thisYear));
  const hhmm = `${String(cur.hour).padStart(2, "0")}:${String(cur.minute).padStart(2, "0")}`;
  return (
    <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("auctions.deadline")}>
      <Select value={cur.day} onChange={(e) => set({ day: Number(e.target.value) })} aria-label={t("prices.day")}>
        {Array.from({ length: jalaliMonthDays(cur.year, cur.month) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{fa(d)}</option>)}
      </Select>
      <Select value={cur.month} onChange={(e) => set({ month: Number(e.target.value) })} aria-label={t("prices.month")}>
        {JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select value={cur.year} onChange={(e) => set({ year: Number(e.target.value) })} aria-label={t("prices.year")}>
        {years.map((y) => <option key={y} value={y}>{fa(y)}</option>)}
      </Select>
      <Input type="time" dir="ltr" value={hhmm} aria-label={t("prices.time")} className="w-28"
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          if (h !== undefined && m !== undefined && !Number.isNaN(h) && !Number.isNaN(m)) set({ hour: h, minute: m });
        }} />
      {clear}
    </span>
  );
}
