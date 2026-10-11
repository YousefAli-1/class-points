import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_POINTS } from "@shared/rules.ts";
import type { Settings } from "@shared/types.ts";
import { expectError, expectJson, getBootstrap, getDay, patch, post, startLesson } from "./data-helpers.ts";
import { adminSession, resetDb, sql } from "./helpers.ts";

beforeEach(resetDb);

const patchSettings = (cookie: string, body: unknown) => patch("/api/settings", body, cookie);

describe("PATCH /api/settings", () => {
  it("settings: rejects warning > clean", async () => {
    const cookie = await adminSession();

    const error = await expectError(patchSettings(cookie, { pointsWarning: 2 }), 400);

    expect(error).toEqual({ code: "BAD_REQUEST", message: "No cards must be worth at least as much as a Warning." });
    expect((await getBootstrap(cookie)).settings).toMatchObject(DEFAULT_POINTS);
  });

  it("checks the order against the merged values", async () => {
    const cookie = await adminSession();

    // Raising both together is fine, even though a Warning of 2 alone is above the stored +1.
    const raised = await expectJson<Settings>(patchSettings(cookie, { pointsClean: 3, pointsWarning: 2 }));
    expect(raised).toMatchObject({ pointsClean: 3, pointsWarning: 2, pointsPenalty: -1 });

    // A Penalty above the stored Warning is refused.
    const error = await expectError(patchSettings(cookie, { pointsPenalty: 3 }), 400);
    expect(error.message).toBe("A Warning must be worth at least as much as Warning + Penalty.");

    expect((await getBootstrap(cookie)).settings).toMatchObject({ pointsClean: 3, pointsWarning: 2, pointsPenalty: -1 });
  });

  it("rejects points outside -10..10", async () => {
    const cookie = await adminSession();

    await expectError(patchSettings(cookie, { pointsClean: 11 }), 400);
    await expectError(patchSettings(cookie, { pointsPenalty: 1.5 }), 400);
  });

  it("updates only the given fields, the teacher name included", async () => {
    const cookie = await adminSession();

    const updated = await expectJson<Settings>(
      patchSettings(cookie, {
        teacherName: " Ms Brown ",
        className: "Class 4A",
        schoolDays: [5, 1, 1],
        soundOn: false,
        reportsNeedPin: true,
      }),
    );

    const expected: Settings = {
      teacherName: "Ms Brown",
      className: "Class 4A",
      ...DEFAULT_POINTS,
      schoolDays: [1, 5],
      soundOn: false,
      reportsNeedPin: true,
      lastBackupAt: null,
    };
    expect(updated).toEqual(expected);
    expect((await getBootstrap(cookie)).settings).toEqual(expected);
    expect(await sql("SELECT name FROM teacher").first("name")).toBe("Ms Brown");

    const unchanged = await expectJson<Settings>(patchSettings(cookie, {}));
    expect(unchanged).toEqual(expected);
  });
});

describe("POST /api/settings/recalculate", () => {
  it("settings: recalculate rewrites snapshots", async () => {
    const cookie = await adminSession();
    await startLesson(cookie, "2025-03-10", 1);
    await startLesson(cookie, "2025-03-11", 2);
    const newPoints = { pointsClean: 5, pointsWarning: 2, pointsPenalty: -3 };
    await expectJson(patchSettings(cookie, newPoints));
    expect((await getDay(cookie, "2025-03-10")).lessons[0]).toMatchObject(DEFAULT_POINTS);

    const result = await expectJson(post("/api/settings/recalculate", cookie));

    expect(result).toEqual({ updated: 2 });
    for (const date of ["2025-03-10", "2025-03-11"]) {
      expect((await getDay(cookie, date)).lessons[0]).toMatchObject(newPoints);
    }
  });

  it("reports zero when there are no lessons", async () => {
    const cookie = await adminSession();

    expect(await expectJson(post("/api/settings/recalculate", cookie))).toEqual({ updated: 0 });
  });
});
