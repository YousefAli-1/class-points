import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_POINTS } from "@shared/rules.ts";
import type { CalendarResponse, DayLesson } from "@shared/types.ts";
import {
  addStudents,
  count,
  del,
  expectError,
  expectJson,
  getDay,
  lessonOf,
  PAST,
  patch,
  putMark,
  startLesson,
  utcDate,
} from "./data-helpers.ts";
import { adminSession, api, resetDb } from "./helpers.ts";

beforeEach(resetDb);

const createLesson = (cookie: string, date: string, subjectId = 1) =>
  api("/api/lessons", { body: { date, subjectId } }, cookie);

describe("POST /api/lessons", () => {
  it("lessons: idempotent create returns same id", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali"]);

    const created = await expectJson<DayLesson>(createLesson(cookie, PAST), 201);
    expect(created).toEqual<DayLesson>({ id: 1, date: PAST, subjectId: 1, ...DEFAULT_POINTS, marks: {} });
    await expectJson(putMark(cookie, created.id, ali.id, "warning", 100));

    const again = await expectJson<DayLesson>(createLesson(cookie, PAST), 200);

    expect(again).toEqual({ ...created, marks: { [ali.id]: { status: "warning", updatedAt: 100 } } });
    expect(await count("lessons")).toBe(1);
    // Another subject on the same day is a different lesson.
    expect((await startLesson(cookie, PAST, 2)).id).not.toBe(created.id);
    expect(await count("lessons")).toBe(2);
  });

  it("lessons: snapshot taken at creation", async () => {
    const cookie = await adminSession();
    const before = await startLesson(cookie, PAST, 1);
    const newPoints = { pointsClean: 3, pointsWarning: 1, pointsPenalty: -2 };
    await expectJson(patch("/api/settings", newPoints, cookie));

    const after = await startLesson(cookie, PAST, 2);

    expect(before).toMatchObject(DEFAULT_POINTS);
    expect(after).toMatchObject(newPoints);
    const day = await getDay(cookie, PAST);
    expect(day.lessons.map(lessonOf)).toEqual([lessonOf(before), lessonOf(after)]);
  });

  it("lessons: accepts tomorrow-UTC, rejects +2", async () => {
    const cookie = await adminSession();

    // The iPad's local today can be one day ahead of UTC.
    await expectJson(createLesson(cookie, utcDate(1)), 201);
    const error = await expectError(createLesson(cookie, utcDate(2)), 400);

    expect(error).toEqual({ code: "BAD_REQUEST", message: "That day hasn't come yet." });
    expect(await count("lessons")).toBe(1);
  });

  it("rejects an unknown subject and bad input", async () => {
    const cookie = await adminSession();

    expect((await expectError(createLesson(cookie, PAST, 99), 404)).message).toBe("Subject wasn't found.");
    await expectError(createLesson(cookie, "2025-02-30"), 400);
    await expectError(api("/api/lessons", { body: { date: PAST } }, cookie), 400);
    expect(await count("lessons")).toBe(0);
  });
});

describe("DELETE /api/lessons/:id", () => {
  it("lessons: delete cascades marks", async () => {
    const cookie = await adminSession();
    const [ali, bea] = await addStudents(cookie, ["Ali", "Bea"]);
    const lesson = await startLesson(cookie, PAST, 1);
    const other = await startLesson(cookie, PAST, 2);
    await expectJson(putMark(cookie, lesson.id, ali.id, "warning", 100));
    await expectJson(putMark(cookie, lesson.id, bea.id, "absent", 100));
    await expectJson(putMark(cookie, other.id, ali.id, "penalty", 100));

    expect(await expectJson(del(`/api/lessons/${lesson.id}`, cookie))).toEqual({ ok: true });

    expect(await count("marks")).toBe(1);
    expect((await getDay(cookie, PAST)).lessons.map((l) => l.id)).toEqual([other.id]);
    await expectError(del(`/api/lessons/${lesson.id}`, cookie), 404);
  });
});

describe("GET /api/calendar", () => {
  it("calendar: lists lessons in month only", async () => {
    const cookie = await adminSession();
    await startLesson(cookie, "2025-02-28");
    const first = await startLesson(cookie, "2025-03-01", 1);
    const second = await startLesson(cookie, "2025-03-01", 2);
    const last = await startLesson(cookie, "2025-03-31");
    await startLesson(cookie, "2025-04-01");

    const calendar = await expectJson<CalendarResponse>(api("/api/calendar?month=2025-03", {}, cookie));

    expect(calendar).toEqual<CalendarResponse>({
      lessons: [first, second, last].map(({ id, date, subjectId }) => ({ id, date, subjectId })),
    });
  });

  it("rejects a bad month", async () => {
    const cookie = await adminSession();

    await expectError(api("/api/calendar?month=2025-13", {}, cookie), 400);
    await expectError(api("/api/calendar", {}, cookie), 400);
  });
});
