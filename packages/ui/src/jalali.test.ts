import { test } from "node:test";
import assert from "node:assert/strict";
import { jalaliInTehran, jalaliMonthDays, jalaliToGregorian, tehranToUTC } from "./jalali.ts";

test("jalaliToGregorian: known dates", () => {
  assert.deepEqual(jalaliToGregorian(1403, 1, 1), { year: 2024, month: 3, day: 20 }); // Nowruz 1403
  assert.deepEqual(jalaliToGregorian(1405, 8, 1), { year: 2026, month: 10, day: 23 });
  assert.deepEqual(jalaliToGregorian(1399, 12, 30), { year: 2021, month: 3, day: 20 }); // leap Esfand
  assert.deepEqual(jalaliToGregorian(1357, 11, 22), { year: 1979, month: 2, day: 11 });
});

test("jalaliMonthDays: Esfand is 30 in leap years only", () => {
  assert.equal(jalaliMonthDays(1403, 1), 31);
  assert.equal(jalaliMonthDays(1403, 7), 30);
  assert.equal(jalaliMonthDays(1399, 12), 30);
  assert.equal(jalaliMonthDays(1400, 12), 29);
  assert.equal(jalaliMonthDays(1403, 12), 30);
});

test("tehranToUTC: Tehran is UTC+03:30", () => {
  assert.equal(tehranToUTC({ year: 1405, month: 8, day: 1 }, 12, 0), "2026-10-23T08:30:00.000Z");
  assert.equal(tehranToUTC({ year: 1403, month: 1, day: 1 }, 0, 30), "2024-03-19T21:00:00.000Z");
});

test("jalaliInTehran round-trips with tehranToUTC", () => {
  const at = new Date("2026-10-23T08:30:00Z");
  const j = jalaliInTehran(at);
  assert.deepEqual({ ...j }, { year: 1405, month: 8, day: 1, hour: 12, minute: 0 });
  assert.equal(tehranToUTC(j, j.hour, j.minute), at.toISOString());
});
