import { describe, expect, it } from "vitest";
import {
  archiveSchema,
  holidayCreateSchema,
  isoDateSchema,
  markPutSchema,
  monthSchema,
  personNameSchema,
  pinSchema,
  reorderSchema,
  reportQuerySchema,
  schoolDaysSchema,
  settingsPatchSchema,
  studentsCreateSchema,
  subjectCreateSchema,
} from "@shared/schemas.ts";

describe("schemas", () => {
  it("pin 4-6 digits", () => {
    expect(pinSchema.safeParse("1234").success).toBe(true);
    expect(pinSchema.safeParse("123456").success).toBe(true);
    expect(pinSchema.safeParse("12a4").success).toBe(false);
    expect(pinSchema.safeParse("1234567").success).toBe(false);
    expect(pinSchema.safeParse("123").success).toBe(false);
  });

  it("holiday end before start fails", () => {
    expect(
      holidayCreateSchema.safeParse({ startDate: "2026-10-12", endDate: "2026-10-11", label: "Break" }).success,
    ).toBe(false);
    expect(
      holidayCreateSchema.safeParse({ startDate: "2026-10-11", endDate: "2026-10-11", label: " Break " }).data,
    ).toEqual({ startDate: "2026-10-11", endDate: "2026-10-11", label: "Break" });
    // At most 366 days, both ends included.
    expect(
      holidayCreateSchema.safeParse({ startDate: "2028-01-01", endDate: "2028-12-31", label: "Leap year" }).success,
    ).toBe(true);
    expect(
      holidayCreateSchema.safeParse({ startDate: "2026-01-01", endDate: "2027-01-02", label: "Too long" }).success,
    ).toBe(false);
    expect(
      holidayCreateSchema.safeParse({ startDate: "2026-10-11", endDate: "2026-10-12", label: "   " }).success,
    ).toBe(false);
    // An invalid date reports only its own error, not a range error.
    const badStart = holidayCreateSchema.safeParse({ startDate: "2026-10-xx", endDate: "2026-10-01", label: "Break" });
    expect(badStart.error?.issues.map((i) => i.path)).toEqual([["startDate"]]);
  });

  it("schoolDays dedup/sort/min1", () => {
    expect(schoolDaysSchema.parse([4, 0, 2, 0, 1, 3])).toEqual([0, 1, 2, 3, 4]);
    expect(schoolDaysSchema.safeParse([]).success).toBe(false);
    expect(schoolDaysSchema.safeParse([7]).success).toBe(false);
    expect(schoolDaysSchema.safeParse([-1]).success).toBe(false);
    expect(schoolDaysSchema.safeParse([1.5]).success).toBe(false);
  });

  it("settingsPatch points range", () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ pointsClean: 10, pointsPenalty: -10 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ pointsClean: 11 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ pointsPenalty: -11 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ pointsWarning: 0.5 }).success).toBe(false);
    expect(settingsPatchSchema.parse({ className: "  Class 3B ", schoolDays: [3, 1], soundOn: false })).toEqual({
      className: "Class 3B",
      schoolDays: [1, 3],
      soundOn: false,
    });
  });

  it("other payloads", () => {
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(archiveSchema.safeParse({ date: "2026-10-11" }).success).toBe(true);
    expect(monthSchema.safeParse("2026-10").success).toBe(true);
    expect(monthSchema.safeParse("2026-13").success).toBe(false);
    expect(personNameSchema.safeParse("x".repeat(41)).success).toBe(false);

    expect(studentsCreateSchema.safeParse({ names: [], activeFrom: "2026-10-11" }).success).toBe(false);
    expect(studentsCreateSchema.safeParse({ names: Array(61).fill("Kid"), activeFrom: "2026-10-11" }).success).toBe(
      false,
    );
    expect(subjectCreateSchema.safeParse({ name: "Art", emoji: "🎨", color: "berry" }).success).toBe(true);
    expect(subjectCreateSchema.safeParse({ name: "Art", emoji: "🎨", color: "red" }).success).toBe(false);

    expect(reorderSchema.safeParse({ ids: [3, 1, 2] }).success).toBe(true);
    expect(reorderSchema.safeParse({ ids: [1, 1] }).success).toBe(false);
    expect(reorderSchema.safeParse({ ids: [0] }).success).toBe(false);

    expect(markPutSchema.safeParse({ status: "penalty", clientTs: 1_760_000_000_000 }).success).toBe(true);
    expect(markPutSchema.safeParse({ status: "late", clientTs: 0 }).success).toBe(false);
    expect(markPutSchema.safeParse({ status: "clean", clientTs: -1 }).success).toBe(false);

    expect(reportQuerySchema.safeParse({ from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(reportQuerySchema.safeParse({ from: "2026-10-31", to: "2026-10-01" }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: "2025-01-01", to: "2026-10-01" }).success).toBe(false);
  });
});
