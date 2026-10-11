import { beforeEach, describe, expect, it } from "vitest";
import type { DayResponse, Mark } from "@shared/types.ts";
import {
  addStudents,
  count,
  expectError,
  expectJson,
  getDay,
  lessonOf,
  PAST,
  putMark,
  startLesson,
} from "./data-helpers.ts";
import { adminSession, api, resetDb } from "./helpers.ts";

beforeEach(resetDb);

describe("PUT /api/lessons/:lessonId/marks/:studentId", () => {
  it("marks: upsert and read back via /days/:date", async () => {
    const cookie = await adminSession();
    const [ali, bea] = await addStudents(cookie, ["Ali", "Bea"]);
    const english = await startLesson(cookie, PAST, 1);
    const maths = await startLesson(cookie, PAST, 2);

    const stored = await expectJson<Mark>(putMark(cookie, english.id, ali.id, "warning", 100));
    expect(stored).toEqual<Mark>({ lessonId: english.id, studentId: ali.id, status: "warning", updatedAt: 100 });
    await expectJson(putMark(cookie, english.id, ali.id, "penalty", 150));
    await expectJson(putMark(cookie, english.id, bea.id, "absent", 120));
    await expectJson(putMark(cookie, maths.id, bea.id, "clean", 130));

    const day = await getDay(cookie, PAST);

    expect(day).toEqual<DayResponse>({
      date: PAST,
      lessons: [
        {
          ...lessonOf(english),
          marks: { [ali.id]: { status: "penalty", updatedAt: 150 }, [bea.id]: { status: "absent", updatedAt: 120 } },
        },
        { ...lessonOf(maths), marks: { [bea.id]: { status: "clean", updatedAt: 130 } } },
      ],
    });
    expect(await getDay(cookie, "2025-03-11")).toEqual({ date: "2025-03-11", lessons: [] });
  });

  it("marks: older clientTs ignored", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali"]);
    const lesson = await startLesson(cookie, PAST);
    await expectJson(putMark(cookie, lesson.id, ali.id, "warning", 200));

    const stale = await expectJson<Mark>(putMark(cookie, lesson.id, ali.id, "penalty", 100));

    expect(stale).toEqual<Mark>({ lessonId: lesson.id, studentId: ali.id, status: "warning", updatedAt: 200 });
    expect((await getDay(cookie, PAST)).lessons[0].marks).toEqual({ [ali.id]: { status: "warning", updatedAt: 200 } });

    // An equal timestamp still wins (last write wins).
    const same = await expectJson<Mark>(putMark(cookie, lesson.id, ali.id, "absent", 200));
    expect(same.status).toBe("absent");
  });

  it("marks: rejects ineligible student", async () => {
    const cookie = await adminSession();
    const [late] = await addStudents(cookie, ["Late"], "2025-03-11");
    const [left, staying] = await addStudents(cookie, ["Left", "Staying"], "2025-01-01");
    await expectJson(api(`/api/students/${left.id}/archive`, { body: { date: PAST } }, cookie));
    await expectJson(api(`/api/students/${staying.id}/archive`, { body: { date: "2025-03-11" } }, cookie));
    const lesson = await startLesson(cookie, PAST);

    // Joined after the lesson day.
    const error = await expectError(putMark(cookie, lesson.id, late.id, "warning", 1), 400);
    expect(error).toEqual({ code: "BAD_REQUEST", message: "That student isn't part of this lesson." });
    // Archived on the lesson day: no longer in it.
    await expectError(putMark(cookie, lesson.id, left.id, "warning", 1), 400);
    // Archived the day after: still in it.
    await expectJson(putMark(cookie, lesson.id, staying.id, "warning", 1));

    expect(await count("marks")).toBe(1);
  });

  it("marks: invalid status 400", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali"]);
    const lesson = await startLesson(cookie, PAST);
    const url = `/api/lessons/${lesson.id}/marks/${ali.id}`;

    await expectError(api(url, { method: "PUT", body: { status: "excellent", clientTs: 1 } }, cookie), 400);
    await expectError(api(url, { method: "PUT", body: { status: "warning", clientTs: -1 } }, cookie), 400);
    await expectError(api(url, { method: "PUT", body: { status: "warning" } }, cookie), 400);

    expect(await count("marks")).toBe(0);
  });

  it("answers 404 for an unknown lesson or student", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali"]);
    const lesson = await startLesson(cookie, PAST);

    expect((await expectError(putMark(cookie, 99, ali.id, "warning", 1), 404)).message).toBe("Lesson wasn't found.");
    expect((await expectError(putMark(cookie, lesson.id, 99, "warning", 1), 404)).message).toBe(
      "Student wasn't found.",
    );
  });
});

describe("GET /api/days/:date", () => {
  it("rejects a date that doesn't exist", async () => {
    const cookie = await adminSession();

    await expectError(api("/api/days/2025-02-30", {}, cookie), 400);
    await expectError(api("/api/days/today", {}, cookie), 400);
  });
});
