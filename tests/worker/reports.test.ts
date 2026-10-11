import { beforeEach, describe, expect, it } from "vitest";
import type { DayLesson, Mark, ReportRaw } from "@shared/types.ts";
import {
  addStudents,
  expectError,
  expectJson,
  lessonOf,
  patch,
  post,
  putMark,
  startLesson,
} from "./data-helpers.ts";
import { adminSession, api, resetDb, unlock } from "./helpers.ts";

beforeEach(resetDb);

const raw = (cookie: string, from: string, to: string) => api(`/api/reports/raw?from=${from}&to=${to}`, {}, cookie);

describe("GET /api/reports/raw", () => {
  it("reports: raw range inclusive", async () => {
    const cookie = await adminSession();
    const [ali, bea] = await addStudents(cookie, ["Ali", "Bea"]);
    const lessons: DayLesson[] = [];
    for (const date of ["2025-03-09", "2025-03-10", "2025-03-14", "2025-03-15"]) {
      const lesson = await startLesson(cookie, date);
      await expectJson(putMark(cookie, lesson.id, ali.id, "warning", 100));
      lessons.push(lesson);
    }
    await expectJson(putMark(cookie, lessons[2].id, bea.id, "absent", 100));
    const [, first, last] = lessons;

    const report = await expectJson<ReportRaw>(raw(cookie, "2025-03-10", "2025-03-14"));

    expect(report.lessons).toEqual([lessonOf(first), lessonOf(last)]);
    expect(report.marks).toEqual<Mark[]>([
      { lessonId: first.id, studentId: ali.id, status: "warning", updatedAt: 100 },
      { lessonId: last.id, studentId: ali.id, status: "warning", updatedAt: 100 },
      { lessonId: last.id, studentId: bea.id, status: "absent", updatedAt: 100 },
    ]);
  });

  it("rejects a bad range", async () => {
    const cookie = await adminSession();

    await expectError(raw(cookie, "2025-03-14", "2025-03-10"), 400);
    await expectError(raw(cookie, "2025-03-10", "nope"), 400);
    await expectError(raw(cookie, "2024-01-01", "2025-12-31"), 400);
  });

  it("reports: needs pin when reportsNeedPin", async () => {
    const cookie = await adminSession();
    const lock = () => post("/api/auth/lock", cookie);

    // Off: reports open while admin is locked.
    await lock();
    await expectJson(raw(cookie, "2025-03-01", "2025-03-31"));

    await unlock(cookie);
    await expectJson(patch("/api/settings", { reportsNeedPin: true }, cookie));
    await lock();
    const error = await expectError(raw(cookie, "2025-03-01", "2025-03-31"), 403);
    expect(error.code).toBe("ADMIN_LOCKED");

    await unlock(cookie);
    await expectJson(raw(cookie, "2025-03-01", "2025-03-31"));
  });
});
