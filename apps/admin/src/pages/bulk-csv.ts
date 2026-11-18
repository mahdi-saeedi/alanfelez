/**
 * The daily price file (client, 2026-11-15): download every active price row with its current price, fill in the new
 * prices of what changed today, upload it. A row left empty means "unchanged today": it is saved again at its current
 * price, so the site shows it updated today with a 0 % change (no "prices updated" SMS for it, see MetalPriceChanges).
 * Plain helpers (no React) so they can be tested on their own.
 */
import type { Schemas } from "@alanfelez/api-client";
import { fromMinor, normalizeDigits, toMinor } from "../amount";

type Series = Schemas["AdminSeries"];

/** The client's metal order (2026-11-02); metals added later go after these. */
const METAL_ORDER = ["aluminum", "copper", "zinc", "lead", "brass", "cast-iron", "iron"];
const MARKET_ORDER = ["ime", "free", "global"];

/** Column titles of the file; "series" is the machine key the upload reads (with «قیمت جدید»). */
export const HEADER = ["series", "فلز", "محصول", "بازار", "واحد", "قیمت فعلی", "تاریخ قیمت فعلی", "قیمت جدید"];

const rank = (list: string[], v: string | undefined) => {
  const i = list.indexOf(v ?? "");
  return i < 0 ? list.length : i;
};

/** Today in Tehran, "YYYY-MM-DD". */
export const tehranDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(d);

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Rows of cells back to CSV text (an uploaded .xlsx is shown and read the same way as a CSV). */
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/**
 * The CSV with the current prices: UTF-8 with a byte order mark and CRLF, so Excel opens the Persian text correctly.
 * labels turns slugs into the admin's words (metal and market names, units).
 */
export function currentPricesCsv(
  series: Series[],
  labels: { metal: (slug: string) => string; market: (slug: string) => string; unit: (s: Series) => string; date: (iso: string) => string },
): string {
  const rows = series
    .filter((s) => s.active)
    .sort((a, b) =>
      rank(METAL_ORDER, a.metal) - rank(METAL_ORDER, b.metal) || (a.metal ?? "").localeCompare(b.metal ?? "") ||
      rank(MARKET_ORDER, a.market) - rank(MARKET_ORDER, b.market) || a.productFa.localeCompare(b.productFa, "fa"));
  const lines = [HEADER, ...rows.map((s) => [
    s.slug, labels.metal(s.metal ?? ""), s.productFa, labels.market(s.market), labels.unit(s),
    s.latestAmount ? fromMinor(s.latestAmount, s.currency) : "", s.latestAt ? labels.date(s.latestAt) : "", "",
  ])];
  return "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** File bytes to text: UTF-8 if valid, else Windows-1256 (what Persian Excel writes for "CSV (Comma delimited)"). */
export function decodeFile(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

/** Splits CSV text into rows of cells: quotes, doubled quotes, and the delimiter of the first line (, ; or tab). */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1]);
  const delim = counts[0]![1] > 1 ? counts[0]![0] : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cur.trim()); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim()); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

export type Planned = { series: string; amount: string; observedAt?: string; unchanged: boolean };
export type Skipped = { series: string; reason: "invalid" | "unknown" | "noPrice" | "today"; text: string };

/**
 * Turns the uploaded rows into what to save. With the downloaded file's header: a new price where one is written, the
 * current price again where the cell is empty (unless it is already from today, or the row has no price yet). Without
 * a header (older files and the text box): "series, amount[, ISO time]" per line, as before.
 */
export function planUpload(rows: string[][], bySlug: Map<string, Series>, now = new Date()): { planned: Planned[]; skipped: Skipped[] } {
  const planned: Planned[] = [];
  const skipped: Skipped[] = [];
  const head = rows[0]?.map((h) => h.replace(/^﻿/, "").trim().toLowerCase()) ?? [];
  const seriesCol = head.indexOf("series");
  const newCol = head.findIndex((h) => h === "قیمت جدید" || h === "new price" || h === "new");
  const today = tehranDay(now);
  if (seriesCol >= 0 && newCol >= 0) {
    for (const r of rows.slice(1)) {
      const slug = (r[seriesCol] ?? "").trim();
      if (!slug || slug.startsWith("#")) continue;
      const s = bySlug.get(slug);
      if (!s) { skipped.push({ series: slug, reason: "unknown", text: r.join(", ") }); continue; }
      const raw = normalizeDigits(r[newCol] ?? "");
      if (raw === "") {
        if (!s.latestAmount) skipped.push({ series: slug, reason: "noPrice", text: s.productFa });
        else if (s.latestAt && tehranDay(new Date(s.latestAt)) === today) skipped.push({ series: slug, reason: "today", text: s.productFa });
        else planned.push({ series: slug, amount: s.latestAmount, unchanged: true });
        continue;
      }
      const minor = toMinor(raw, s.currency);
      if (!minor) { skipped.push({ series: slug, reason: "invalid", text: `${s.productFa}: ${r[newCol]}` }); continue; }
      planned.push({ series: slug, amount: minor, unchanged: minor === s.latestAmount });
    }
    return { planned, skipped };
  }
  for (const r of rows) {
    const [slug = "", raw = "", when = ""] = r;
    if (!slug || slug.startsWith("#") || /^series$/i.test(slug)) continue;
    const s = bySlug.get(slug);
    const minor = s ? toMinor(raw, s.currency) : null;
    if (!s || !minor) { skipped.push({ series: slug, reason: s ? "invalid" : "unknown", text: r.join(", ") }); continue; }
    planned.push({ series: slug, amount: minor, unchanged: minor === s.latestAmount, ...(when ? { observedAt: new Date(when).toISOString() } : {}) });
  }
  return { planned, skipped };
}
