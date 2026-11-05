import { getSeasonForDate, getSeasonLabel } from "../src/utils/season.js";

const cases = [
  [new Date(2026, 0, 15), "winter"],
  [new Date(2026, 1, 15), "winter"],
  [new Date(2026, 2, 1), "spring"],
  [new Date(2026, 4, 31), "spring"],
  [new Date(2026, 5, 1), "summer"],
  [new Date(2026, 7, 31), "summer"],
  [new Date(2026, 8, 1), "autumn"],
  [new Date(2026, 10, 30), "autumn"],
  [new Date(2026, 11, 1), "winter"]
];

for (const [date, expected] of cases) {
  const actual = getSeasonForDate(date);
  if (actual !== expected) {
    throw new Error(
      `${date.toISOString()} expected ${expected}, received ${actual}`
    );
  }
  if (!getSeasonLabel(actual)) {
    throw new Error(`Missing label for ${actual}`);
  }
}

console.log(JSON.stringify({ ok: true, cases: cases.length }));
