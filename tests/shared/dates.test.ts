import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  dayKind,
  daysBetween,
  formatLongDate,
  holidayOn,
  isValidISODate,
  monthGrid,
  monthOf,
  parseISODate,
  periodLabel,
  periodRange,
  shiftPeriod,
  toISODate,
  todayISO,
  weekStartDay,
  weekdayOf,
} from "@shared/dates.ts";
import type { Holiday } from "@shared/types.ts";

const SUN_THU = [0, 1, 2, 3, 4];
const MON_FRI = [1, 2, 3, 4, 5];

describe("dates", () => {
  it("weekStartDay", () => {
    expect(weekStartDay(SUN_THU)).toBe(0);
    expect(weekStartDay(MON_FRI)).toBe(1);
    expect(weekStartDay([6, 0, 1, 2, 3])).toBe(6);
    expect(weekStartDay([0, 1, 2, 3, 4, 5, 6])).toBe(1);
    expect(weekStartDay([1, 2, 4, 5])).toBe(1);
  });

  it("dayKind", () => {
    const today = "2026-10-11"; // Sunday
    const holidays: Holiday[] = [{ id: 1, startDate: "2026-10-05", endDate: "2026-10-07", label: "Autumn break" }];

    expect(dayKind("2026-10-12", today, SUN_THU, holidays)).toBe("future");
    expect(dayKind("2026-10-05", today, SUN_THU, holidays)).toBe("holiday");
    expect(dayKind("2026-10-06", today, SUN_THU, holidays)).toBe("holiday");
    expect(dayKind("2026-10-07", today, SUN_THU, holidays)).toBe("holiday");
    expect(dayKind("2026-10-09", today, SUN_THU, holidays)).toBe("off"); // Friday
    expect(dayKind("2026-10-08", today, SUN_THU, holidays)).toBe("school"); // Thursday
    expect(dayKind(today, today, SUN_THU, holidays)).toBe("school");

    expect(holidayOn("2026-10-06", holidays)?.label).toBe("Autumn break");
    expect(holidayOn("2026-10-08", holidays)).toBeUndefined();
  });

  it("periodRange week", () => {
    expect(periodRange("week", "2026-10-14", SUN_THU)).toEqual({ from: "2026-10-11", to: "2026-10-17" });
    expect(periodRange("week", "2026-10-14", MON_FRI)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    // The anchor itself can be the first day of the week.
    expect(periodRange("week", "2026-10-11", SUN_THU)).toEqual({ from: "2026-10-11", to: "2026-10-17" });
  });

  it("periodRange month", () => {
    expect(periodRange("month", "2026-02-10", SUN_THU)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("month", "2028-02-10", SUN_THU)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("day", "2026-10-14", SUN_THU)).toEqual({ from: "2026-10-14", to: "2026-10-14" });
  });

  it("shiftPeriod", () => {
    expect(monthOf(shiftPeriod("month", "2026-03-31", -1))).toBe("2026-02");
    expect(shiftPeriod("week", "2026-10-14", 1)).toBe("2026-10-21");
    expect(shiftPeriod("day", "2026-10-01", -1)).toBe("2026-09-30");
  });

  it("monthGrid", () => {
    const grid = monthGrid("2026-10", 0);
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toBe("2026-09-27");
    expect(grid[4][6]).toBe("2026-10-31");
    for (const row of grid) expect(row).toHaveLength(7);

    // February 2026 starts on a Sunday and has 28 days: exactly 4 rows.
    expect(monthGrid("2026-02", 0)).toHaveLength(4);
    // August 2026 starts on a Saturday: with a Sunday week start it needs 6 rows.
    const august = monthGrid("2026-08", 0);
    expect(august).toHaveLength(6);
    expect(august[0][6]).toBe("2026-08-01");
    expect(august[5][0]).toBe("2026-08-30");
  });

  it("periodLabel", () => {
    expect(periodLabel("day", { from: "2026-10-11", to: "2026-10-11" })).toBe("Sun 11 Oct 2026");
    expect(periodLabel("week", { from: "2026-10-11", to: "2026-10-17" })).toBe("11 – 17 Oct 2026");
    expect(periodLabel("week", { from: "2026-09-27", to: "2026-10-03" })).toBe("27 Sep – 3 Oct 2026");
    expect(periodLabel("week", { from: "2026-12-27", to: "2027-01-02" })).toBe("27 Dec 2026 – 2 Jan 2027");
    expect(periodLabel("month", { from: "2026-10-01", to: "2026-10-31" })).toBe("October 2026");
  });

  it("formatLongDate", () => {
    expect(formatLongDate("2026-10-11")).toEqual({ weekday: "Sunday", full: "11 October 2026" });
  });

  it("parsing, validation and arithmetic", () => {
    expect(isValidISODate("2026-10-11")).toBe(true);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-1-01")).toBe(false);
    expect(isValidISODate("not a date")).toBe(false);

    const parsed = parseISODate("2026-10-11");
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours()]).toEqual([2026, 9, 11, 0]);
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(todayISO(new Date(2026, 9, 11, 8, 30))).toBe("2026-10-11");

    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-11", "2026-10-18")).toBe(7);
    expect(daysBetween("2026-10-18", "2026-10-11")).toBe(-7);
    expect(weekdayOf("2026-10-11")).toBe(0);
    expect(weekdayOf("2026-10-17")).toBe(6);
    expect(monthOf("2026-10-11")).toBe("2026-10");
  });
});

// America/Santiago skips local midnight when DST starts (2026-09-06 00:00 → 01:00).
// Arithmetic that adds or subtracts milliseconds lands on the wrong calendar day there.
describe("dates across a DST change", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/Santiago";
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("stays on calendar days when local midnight does not exist", () => {
    // Sanity check that the zone is active and has the gap, so the assertions below mean something.
    expect(new Date(2026, 8, 6).getHours()).toBe(1);

    expect(parseISODate("2026-09-06").getDate()).toBe(6);
    expect(addDays("2026-09-07", -1)).toBe("2026-09-06");
    expect(addDays("2026-09-05", 1)).toBe("2026-09-06");
    expect(daysBetween("2026-09-01", "2026-09-30")).toBe(29);
    expect(periodRange("week", "2026-09-09", MON_FRI)).toEqual({ from: "2026-09-07", to: "2026-09-13" });
    expect(monthGrid("2026-09", 0).flat()).toContain("2026-09-06");
    expect(new Set(monthGrid("2026-09", 0).flat()).size).toBe(35);
  });
});
