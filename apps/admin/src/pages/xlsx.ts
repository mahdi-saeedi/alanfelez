/**
 * Reads the first sheet of an Excel .xlsx file into rows of text cells (client, 2026-11-18: upload the daily price file
 * as Excel saves it, without "Save as CSV"). No library: an .xlsx is a zip of XML files; the browser's
 * DecompressionStream unzips them. Only what the daily file needs: text, numbers, the first sheet.
 * Plain helpers (no React) so they can be tested on their own.
 */

/** True if the bytes start like a zip file (every .xlsx does; a CSV never does). */
export function isZip(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/** The files of a zip by name (lazy: each is unpacked when asked for). */
function readZip(bytes: ArrayBuffer): Map<string, () => Promise<string>> {
  const v = new DataView(bytes);
  // The "end of central directory" record is in the last 64 KiB + 22 bytes.
  let end = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip file");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const files = new Map<string, () => Promise<string>>();
  const utf8 = new TextDecoder("utf-8");
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("broken zip directory");
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = utf8.decode(new Uint8Array(bytes, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    files.set(name, async () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = new Uint8Array(bytes, start, size);
      if (method === 0) return utf8.decode(data);
      if (method !== 8) throw new Error(`unsupported zip method ${method}`);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return utf8.decode(await new Response(stream).arrayBuffer());
    });
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-fA-F]+|#\d+);/g, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&"
      : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));

/** All the text of <t> elements inside a piece of XML (a shared string can be split in formatted runs). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join("");

/** "C" → 2, "AA" → 26. */
const colIndex = (ref: string) => [...ref.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** A number as Excel stores it ("3.39537E6", "2784.4000000000001") written plainly: "3395370", "2784.4". */
const plainNumber = (raw: string) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const r = Number(n.toPrecision(15));
  return Number.isInteger(r) ? BigInt(r).toString() : String(r);
};

/** The first sheet of an .xlsx as rows of cell text (empty cells are ""). */
export async function readXlsx(bytes: ArrayBuffer): Promise<string[][]> {
  const files = readZip(bytes);
  const get = async (name: string) => (await files.get(name)?.()) ?? "";
  // The first sheet in the workbook's order, through its relationship id (the file name isn't always sheet1.xml).
  const workbook = await get("xl/workbook.xml");
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = await get("xl/_rels/workbook.xml.rels");
  const target = rid ? new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1]
    ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid}"`).exec(rels)?.[1] : undefined;
  const sheetPath = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
  const shared = [...(await get("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
  const sheet = await get(sheetPath);
  if (!sheet) throw new Error("no sheet in the file");

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const body = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str" || type === "e") value = raw === undefined ? "" : unescapeXml(raw);
      else if (type === "b") value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : "";
      else value = raw === undefined ? "" : plainNumber(raw);
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push("");
      row[at] = value.trim();
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}
