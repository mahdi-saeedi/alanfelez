import { test } from "node:test";
import assert from "node:assert/strict";
import { displayAmount, formatBp, formatChangeValue, formatDate, formatPriceValue, formatTime, formatToman, formatTons, parseDecimal, priceUnitLabel, tehranDaysAgo } from "./format.ts";

const copper = { amount: "6400000", currency: "IRR", unit: "kg" } as const; // 6,400,000 Rial/kg
const lme = { amount: "980012", currency: "USD", unit: "ton" } as const; // $9,800.12/ton

test("IRR is shown in Toman per kg by default, with Rial and per-ton switches", () => {
  assert.equal(displayAmount(copper), 640_000n);
  assert.equal(displayAmount(copper, { rial: true }), 6_400_000n);
  assert.equal(displayAmount(copper, { perTon: true }), 640_000_000n);
  assert.equal(displayAmount({ amount: "12345", currency: "IRR", unit: "kg" }), 1235n); // rounds half up
  assert.equal(formatPriceValue(copper, "en"), "640,000");
  assert.equal(formatPriceValue(copper, "fa"), "۶۴۰٬۰۰۰");
});

test("USD (LME) is shown in dollars per ton", () => {
  assert.equal(displayAmount(lme), 9_800n);
  assert.equal(priceUnitLabel(lme, "fa"), "$/ton");
  assert.equal(priceUnitLabel(copper, "fa"), "تومان/kg");
  assert.equal(priceUnitLabel(copper, "en", { rial: true, perTon: true }), "Rial/ton");
});

test("changes are signed", () => {
  assert.equal(formatChangeValue("21000", copper, "en"), "+2,100");
  assert.equal(formatChangeValue("-15000", copper, "en"), "−1,500");
  assert.equal(formatChangeValue("0", copper, "en"), "0");
  assert.equal(formatBp(125, "en"), "+1.25%");
  assert.equal(formatBp(-50, "en"), "-0.50%");
  assert.equal(formatBp(0, "en"), "0.00%");
  assert.match(formatBp(125, "fa"), /۱٫۲۵/);
});

test("times are Tehran time; fa dates are Jalali", () => {
  const iso = "2024-08-23T06:32:00Z"; // 10:02 in Tehran (+03:30)
  assert.equal(formatTime(iso, "en"), "10:02");
  assert.equal(formatTime(iso, "fa"), "۱۰:۰۲");
  assert.equal(formatDate(iso, "fa"), "۲ شهریور ۱۴۰۳");
  assert.equal(formatDate(iso, "en"), "23 Aug 2024");
});

test("plan prices stay in Toman", () => {
  assert.equal(formatToman("20000000", "en"), "2,000,000 Toman");
});

test("weights are shown in tonnes", () => {
  assert.equal(formatTons(2_500_500, "en"), "2,500.5 t");
  assert.equal(formatTons(100_000, "fa"), "۱۰۰ تن");
});

test("numbers typed with Persian digits and separators parse", () => {
  assert.equal(parseDecimal("۱۲٬۵۰۰"), 12500);
  assert.equal(parseDecimal("۲٫۵"), 2.5);
  assert.equal(parseDecimal("1,000.25"), 1000.25);
  assert.equal(parseDecimal(" 10 "), 10);
  assert.equal(parseDecimal(""), undefined);
  assert.equal(parseDecimal("abc"), undefined);
  assert.equal(parseDecimal("1.2.3"), undefined);
});

test("tehranDaysAgo counts Tehran calendar days, not 24-hour spans", () => {
  const now = new Date("2026-10-28T06:00:00Z"); // 09:30 in Tehran
  assert.equal(tehranDaysAgo("2026-10-28T05:00:00Z", now), 0);
  assert.equal(tehranDaysAgo("2026-10-27T21:00:00Z", now), 0); // 00:30 Tehran, same day
  assert.equal(tehranDaysAgo("2026-10-27T20:00:00Z", now), 1); // 23:30 Tehran the day before
  assert.equal(tehranDaysAgo("2026-10-23T12:00:00Z", now), 5);
});
