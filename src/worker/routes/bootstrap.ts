import { Hono } from "hono";
import type { Bootstrap } from "@shared/types.ts";
import type { AppEnv } from "../lib/session.ts";
import { selectHolidays } from "./holidays.ts";
import { onlySettings, selectSettings } from "./settings.ts";
import { selectStudents } from "./students.ts";
import { selectSubjects } from "./subjects.ts";

export const bootstrapRoutes = new Hono<AppEnv>();

/** Everything the app needs at start, archived subjects and students included. */
bootstrapRoutes.get("/", async (c) => {
  const db = c.get("db");
  const [settingsRows, subjectRows, studentRows, holidayRows] = await db.batch([
    selectSettings(db),
    selectSubjects(db),
    selectStudents(db),
    selectHolidays(db),
  ]);
  return c.json<Bootstrap>({
    settings: onlySettings(settingsRows),
    subjects: subjectRows,
    students: studentRows,
    holidays: holidayRows,
  });
});
