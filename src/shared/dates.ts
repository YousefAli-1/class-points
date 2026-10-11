import {
  addDays as addDaysToDate,
  addMonths,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  lastDayOfMonth,
} from "date-fns";
import type { Holiday, ISODate } from "./types.ts";

// All maths goes through local Dates built from Y-M-D parts and date-fns calendar helpers, never by
// adding milliseconds, so it stays on the right day across DST changes (even where midnight is skipped).

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** True for a real calendar date written as `YYYY-MM-DD`. */
export function isValidISODate(s: string): boolean {
  const match = ISO_DATE.exec(s);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1) return false;
  const monthLength = m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1];
  return d <= monthLength;
}

/** The local calendar date of `d`. */
export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

/** Local midnight on `s` (or the first moment of that day if a DST change skips midnight). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setFullYear(y); // the Date constructor maps years 0–99 to 1900–1999
  return date;
}

/** The device's local date. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(date: ISODate, n: number): ISODate {
  return toISODate(addDaysToDate(parseISODate(date), n));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: ISODate): number {
  return parseISODate(date).getDay();
}

/** `b - a` in calendar days. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseISODate(b), parseISODate(a));
}

export type DayKind = "future" | "holiday" | "off" | "school";

/** The holiday whose range (inclusive at both ends) contains `date`. */
export function holidayOn(date: ISODate, holidays: readonly Holiday[]): Holiday | undefined {
  return holidays.find((h) => h.startDate <= date && date <= h.endDate);
}

export function dayKind(
  date: ISODate,
  today: ISODate,
  schoolDays: readonly number[],
  holidays: readonly Holiday[],
): DayKind {
  if (date > today) return "future";
  if (holidayOn(date, holidays)) return "holiday";
  if (!schoolDays.includes(weekdayOf(date))) return "off";
  return "school";
}

/**
 * The weekday a week starts on: the day after the longest circular run of days off
 * (Sun–Thu → Sunday, Mon–Fri → Monday, Sat–Wed → Saturday). Ties go to the candidate that comes
 * first counting from Monday. With no days off (or no school days) it is Monday.
 */
export function weekStartDay(schoolDays: readonly number[]): number {
  const isOff = (d: number) => !schoolDays.includes(d);
  const fromMonday = (d: number) => (d + 6) % 7;

  let best: { day: number; run: number } | null = null;
  for (let day = 0; day < 7; day++) {
    // Candidates are school days; measure the run of days off just before each one.
    if (isOff(day)) continue;
    let run = 0;
    while (run < 6 && isOff((day - run - 1 + 7) % 7)) run++;
    if (run === 0) continue;
    if (!best || run > best.run || (run === best.run && fromMonday(day) < fromMonday(best.day))) {
      best = { day, run };
    }
  }
  return best?.day ?? 1;
}

export type Period = "day" | "week" | "month";

export function periodRange(
  period: Period,
  anchor: ISODate,
  schoolDays: readonly number[],
): { from: ISODate; to: ISODate } {
  switch (period) {
    case "day":
      return { from: anchor, to: anchor };
    case "week": {
      const back = (weekdayOf(anchor) - weekStartDay(schoolDays) + 7) % 7;
      const from = addDays(anchor, -back);
      return { from, to: addDays(from, 6) };
    }
    case "month":
      return { from: `${monthOf(anchor)}-01`, to: toISODate(lastDayOfMonth(parseISODate(anchor))) };
  }
}

/** Moves `anchor` by `delta` periods. Months clamp to the end of shorter months (31 Mar − 1 → 28 Feb). */
export function shiftPeriod(period: Period, anchor: ISODate, delta: number): ISODate {
  switch (period) {
    case "day":
      return addDays(anchor, delta);
    case "week":
      return addDays(anchor, delta * 7);
    case "month":
      return toISODate(addMonths(parseISODate(anchor), delta));
  }
}

/** 'Sun 11 Oct 2026', '11 – 17 Oct 2026', '27 Sep – 3 Oct 2026', 'October 2026'. */
export function periodLabel(period: Period, range: { from: ISODate; to: ISODate }): string {
  const from = parseISODate(range.from);
  const to = parseISODate(range.to);
  switch (period) {
    case "day":
      return format(from, "EEE d MMM yyyy");
    case "month":
      return format(from, "MMMM yyyy");
    case "week": {
      const end = format(to, "d MMM yyyy");
      if (from.getFullYear() !== to.getFullYear()) return `${format(from, "d MMM yyyy")} – ${end}`;
      if (from.getMonth() !== to.getMonth()) return `${format(from, "d MMM")} – ${end}`;
      return `${format(from, "d")} – ${end}`;
    }
  }
}

/** Weeks (rows of 7, starting on `weekStart`) covering the whole of `month` ('YYYY-MM'). 4–6 rows. */
export function monthGrid(month: string, weekStart: number): ISODate[][] {
  const first = `${month}-01`;
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const start = addDays(first, -lead);
  const rows = Math.ceil((lead + getDaysInMonth(parseISODate(first))) / 7);
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => addDays(start, row * 7 + col)),
  );
}

/** 'YYYY-MM'. */
export function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}

/** { weekday: 'Sunday', full: '11 October 2026' } */
export function formatLongDate(date: ISODate): { weekday: string; full: string } {
  const d = parseISODate(date);
  return { weekday: format(d, "EEEE"), full: format(d, "d MMMM yyyy") };
}
