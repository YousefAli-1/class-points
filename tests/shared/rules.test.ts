import { describe, expect, it } from "vitest";
import {
  DEFAULT_POINTS,
  applyAction,
  formatPoints,
  hasPenaltyCard,
  hasWarningCard,
  isEligible,
  pointsFor,
  validatePointValues,
} from "@shared/rules.ts";
import type { MarkStatus } from "@shared/types.ts";

describe("rules", () => {
  it("applyAction warning toggles", () => {
    expect(applyAction("clean", "warning")).toEqual({ ok: true, status: "warning" });
    expect(applyAction("warning", "warning")).toEqual({ ok: true, status: "clean" });
    expect(applyAction("penalty", "warning")).toEqual({ ok: true, status: "clean" });
  });

  it("applyAction penalty needs warning", () => {
    expect(applyAction("clean", "penalty")).toEqual({ ok: false, reason: "NEED_WARNING" });
    expect(applyAction("warning", "penalty")).toEqual({ ok: true, status: "penalty" });
    expect(applyAction("penalty", "penalty")).toEqual({ ok: true, status: "warning" });
  });

  it("applyAction absent", () => {
    expect(applyAction("clean", "absent")).toEqual({ ok: true, status: "absent" });
    expect(applyAction("warning", "absent")).toEqual({ ok: true, status: "absent" });
    expect(applyAction("penalty", "absent")).toEqual({ ok: true, status: "absent" });
    expect(applyAction("absent", "absent")).toEqual({ ok: true, status: "clean" });
    expect(applyAction("absent", "warning")).toEqual({ ok: false, reason: "ABSENT" });
    expect(applyAction("absent", "penalty")).toEqual({ ok: false, reason: "ABSENT" });
  });

  it("pointsFor uses values", () => {
    const values = { pointsClean: 3, pointsWarning: 1, pointsPenalty: -2 };
    expect(pointsFor("clean", values)).toBe(3);
    expect(pointsFor("warning", values)).toBe(1);
    expect(pointsFor("penalty", values)).toBe(-2);
    expect(pointsFor("absent", values)).toBeNull();
  });

  it("card helpers", () => {
    const statuses: MarkStatus[] = ["clean", "warning", "penalty", "absent"];
    expect(statuses.map(hasWarningCard)).toEqual([false, true, true, false]);
    expect(statuses.map(hasPenaltyCard)).toEqual([false, false, true, false]);
  });

  it("validatePointValues", () => {
    expect(DEFAULT_POINTS).toEqual({ pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 });
    expect(validatePointValues({ pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 })).toBeNull();
    expect(validatePointValues({ pointsClean: 0, pointsWarning: 1, pointsPenalty: -1 })).toContain("No cards");
    expect(validatePointValues({ pointsClean: 1, pointsWarning: 0, pointsPenalty: 11 })).toEqual(expect.any(String));
    expect(validatePointValues({ pointsClean: 1, pointsWarning: -2, pointsPenalty: -1 })).toEqual(expect.any(String));
    expect(validatePointValues({ pointsClean: 1.5, pointsWarning: 0, pointsPenalty: -1 })).toEqual(expect.any(String));
    expect(validatePointValues({ pointsClean: 2, pointsWarning: 2, pointsPenalty: 2 })).toBeNull();
  });

  it("isEligible", () => {
    const lateJoiner = { activeFrom: "2026-10-10", archivedAt: null };
    expect(isEligible(lateJoiner, "2026-10-09")).toBe(false);
    expect(isEligible(lateJoiner, "2026-10-10")).toBe(true);

    const archived = { activeFrom: "2026-09-01", archivedAt: "2026-10-11" };
    expect(isEligible(archived, "2026-10-10")).toBe(true);
    expect(isEligible(archived, "2026-10-11")).toBe(false);
  });

  it("formatPoints", () => {
    expect(formatPoints(1)).toBe("+1");
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(-1)).toBe("−1");
    expect(formatPoints(-0)).toBe("0");
  });
});
