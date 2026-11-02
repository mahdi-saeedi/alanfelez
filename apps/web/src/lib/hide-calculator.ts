// Takes the calculator out of CMS texts on the site where it is hidden (client, 2026-11-02: "remove it from those
// texts on the main site only, keep it on staging"). The texts stay as they are in the database (staging shows them
// whole); this edits them on the way to the page. It matches the wording as loaded from the client's Word files: a
// text the client rewrites in the admin no longer matches, and then is shown as written.

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const toFa = (n: number) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!);
const fromFa = (s: string) => Number(s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))));

/** Phrase edits that keep the sentences grammatical (Persian and English). */
const PHRASES: [RegExp, string][] = [
  [/، تحلیل‌ها و ماشین حساب قیمت را/g, " و تحلیل‌ها را"],
  [/، ماشین حساب تخصصی و هشدار پیامکی/g, " و هشدار پیامکی"],
  [/تا تحلیل بازار و ماشین حساب قیمت؛/g, "تا تحلیل بازار؛"],
  [/، جزئیات مزایدات و ماشین حساب\./g, " و جزئیات مزایدات."],
  [/\s*<li>ماشین حساب قیمت فلزات<\/li>/g, ""],
  [/, analyses and the price calculator in one place/g, " and analyses in one place"],
  [/, the specialist calculator and SMS alerts/g, " and SMS alerts"],
  [/to market analysis and the price calculator,/g, "to market analysis,"],
  [/\s*<li>A metal price calculator<\/li>/g, ""],
];

/** Drops the terms' «۷. ماشین‌حساب قیمت» / "7. Price calculator" section and renumbers the sections after it. */
function dropCalculatorSection(html: string): string {
  const m = html.match(/<h2>\s*([۰-۹\d]+)\.\s*(?:ماشین‌حساب قیمت|ماشین حساب قیمت|Price calculator)\s*<\/h2>/);
  if (!m || m.index === undefined) return html;
  const num = fromFa(m[1]!);
  const start = m.index;
  const next = html.indexOf("<h2", start + m[0].length);
  const rest = next < 0 ? "" : html.slice(next);
  const renumbered = rest.replace(/<h2>\s*([۰-۹\d]+)\./g, (_, n: string) => {
    const v = fromFa(n);
    if (v <= num) return `<h2>${n}.`;
    return `<h2>${/[۰-۹]/.test(n) ? toFa(v - 1) : String(v - 1)}.`;
  });
  return html.slice(0, start) + renumbered;
}

export function withoutCalculator(html: string): string {
  let out = html;
  for (const [re, to] of PHRASES) out = out.replace(re, to);
  return dropCalculatorSection(out);
}
