import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { BackupFile } from "@shared/types.ts";
import { lessons, marks, settings } from "../db/schema.ts";
import { type AppEnv, requireAdmin } from "../lib/session.ts";
import { selectHolidays } from "./holidays.ts";
import { lessonFields, markFields } from "./lessons.ts";
import { onlySettings, selectSettings } from "./settings.ts";
import { selectStudents } from "./students.ts";
import { selectSubjects } from "./subjects.ts";

export const backupRoutes = new Hono<AppEnv>().use(requireAdmin);

/**
 * A full JSON export of the teacher-facing tables (no secrets or sessions). Stamps `lastBackupAt`
 * first, in the same batch, so the file is one consistent snapshot that records its own time.
 */
backupRoutes.get("/", async (c) => {
  const db = c.get("db");
  const now = Date.now();
  const [, settingsRows, subjectRows, studentRows, holidayRows, lessonRows, markRows] = await db.batch([
    db.update(settings).set({ lastBackupAt: now }).where(eq(settings.id, 1)),
    selectSettings(db),
    selectSubjects(db),
    selectStudents(db),
    selectHolidays(db),
    db.select(lessonFields).from(lessons).orderBy(asc(lessons.date), asc(lessons.id)),
    db.select(markFields).from(marks).orderBy(asc(marks.lessonId), asc(marks.studentId)),
  ]);
  return c.json<BackupFile>({
    version: 1,
    exportedAt: now,
    settings: onlySettings(settingsRows),
    subjects: subjectRows,
    students: studentRows,
    holidays: holidayRows,
    lessons: lessonRows,
    marks: markRows,
  });
});
