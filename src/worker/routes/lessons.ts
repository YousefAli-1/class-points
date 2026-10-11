import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { isEligible } from "@shared/rules.ts";
import { lessonCreateSchema, markPutSchema } from "@shared/schemas.ts";
import type { DayLesson, ISODate, Mark } from "@shared/types.ts";
import type { Db } from "../db/client.ts";
import { lessons, marks, students, subjects } from "../db/schema.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import type { AppEnv } from "../lib/session.ts";
import { parseJson } from "../lib/validate.ts";
import { readSettings } from "./settings.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The API's Lesson: the row without its internal `createdAt`. */
export const lessonFields = {
  id: lessons.id,
  date: lessons.date,
  subjectId: lessons.subjectId,
  pointsClean: lessons.pointsClean,
  pointsWarning: lessons.pointsWarning,
  pointsPenalty: lessons.pointsPenalty,
};

/** Mark columns spelled out, for selects that join lessons. */
export const markFields = {
  lessonId: marks.lessonId,
  studentId: marks.studentId,
  status: marks.status,
  updatedAt: marks.updatedAt,
};

/**
 * Spec §4.2: only today or earlier. "Today" is the iPad's local date, which can be a day ahead
 * of UTC, so the server accepts up to UTC-today + 1.
 */
export function assertDayHasCome(date: ISODate): void {
  const latest = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
  if (date > latest) throw badRequest("That day hasn't come yet.");
}

/** The lessons matching `where` (a condition on `lessons`), in the order they were started, with their marks. */
export async function loadDayLessons(db: Db, where: SQL | undefined): Promise<DayLesson[]> {
  const [lessonRows, markRows] = await db.batch([
    db.select(lessonFields).from(lessons).where(where).orderBy(asc(lessons.id)),
    db.select(markFields).from(marks).innerJoin(lessons, eq(lessons.id, marks.lessonId)).where(where),
  ]);
  const byId = new Map(lessonRows.map((lesson): [number, DayLesson] => [lesson.id, { ...lesson, marks: {} }]));
  for (const { lessonId, studentId, status, updatedAt } of markRows) {
    const lesson = byId.get(lessonId);
    if (lesson) lesson.marks[studentId] = { status, updatedAt };
  }
  return [...byId.values()];
}

// Lessons and marks are class routes: no admin unlock needed.
export const lessonRoutes = new Hono<AppEnv>();

/** "Start lesson". Idempotent: 201 with a new lesson, or 200 with the one already there. */
lessonRoutes.post("/", async (c) => {
  const { date, subjectId } = await parseJson(c, lessonCreateSchema);
  assertDayHasCome(date);
  const db = c.get("db");
  const subject = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).get();
  if (!subject) throw notFound("Subject");

  // The lesson keeps a snapshot of today's point values (spec §4.2).
  const { pointsClean, pointsWarning, pointsPenalty } = await readSettings(db);
  const [created] = await db
    .insert(lessons)
    .values({ date, subjectId, pointsClean, pointsWarning, pointsPenalty, createdAt: Date.now() })
    .onConflictDoNothing({ target: [lessons.date, lessons.subjectId] })
    .returning(lessonFields);
  if (created) return c.json<DayLesson>({ ...created, marks: {} }, 201);

  const [existing] = await loadDayLessons(db, and(eq(lessons.date, date), eq(lessons.subjectId, subjectId)));
  // Only if it was cancelled between the two statements.
  if (!existing) throw conflict("That lesson just changed. Please try again.");
  return c.json<DayLesson>(existing, 200);
});

/** "Cancel lesson". Its marks go too (ON DELETE CASCADE). */
lessonRoutes.delete("/:id{[0-9]+}", async (c) => {
  const deleted = await c
    .get("db")
    .delete(lessons)
    .where(eq(lessons.id, Number(c.req.param("id"))))
    .returning({ id: lessons.id });
  if (deleted.length === 0) throw notFound("Lesson");
  return c.json({ ok: true });
});

/**
 * Sets one student's status in one lesson. Last write wins by the client's clock (`clientTs`), so an
 * offline write that arrives late never undoes a newer tap. Returns the stored mark, which may be that newer one.
 */
lessonRoutes.put("/:lessonId{[0-9]+}/marks/:studentId{[0-9]+}", async (c) => {
  const { status, clientTs } = await parseJson(c, markPutSchema);
  const lessonId = Number(c.req.param("lessonId"));
  const studentId = Number(c.req.param("studentId"));
  const db = c.get("db");
  const [[lesson], [student]] = await db.batch([
    db.select({ date: lessons.date }).from(lessons).where(eq(lessons.id, lessonId)),
    db
      .select({ activeFrom: students.activeFrom, archivedAt: students.archivedAt })
      .from(students)
      .where(eq(students.id, studentId)),
  ]);
  if (!lesson) throw notFound("Lesson");
  if (!student) throw notFound("Student");
  if (!isEligible(student, lesson.date)) throw badRequest("That student isn't part of this lesson.");

  // Two awaits, not one batch: drizzle's D1 batch can't run a raw `db.run` statement.
  await db.run(sql`
    INSERT INTO marks (lesson_id, student_id, status, updated_at)
    VALUES (${lessonId}, ${studentId}, ${status}, ${clientTs})
    ON CONFLICT (lesson_id, student_id) DO UPDATE
      SET status = excluded.status, updated_at = excluded.updated_at
      WHERE excluded.updated_at >= marks.updated_at
  `);
  const stored = await db
    .select(markFields)
    .from(marks)
    .where(and(eq(marks.lessonId, lessonId), eq(marks.studentId, studentId)))
    .get();
  // Only if the lesson or student was deleted in between (the delete cascades to the mark).
  if (!stored) throw conflict("That lesson just changed. Please try again.");
  return c.json<Mark>(stored);
});
