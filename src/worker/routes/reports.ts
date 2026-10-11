import { asc, between, eq } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { reportQuerySchema } from "@shared/schemas.ts";
import type { ReportRaw } from "@shared/types.ts";
import { lessons, marks, settings } from "../db/schema.ts";
import { type AppEnv, requireAdmin } from "../lib/session.ts";
import { parseQuery } from "../lib/validate.ts";
import { lessonFields, markFields } from "./lessons.ts";

/** With "Reports need the PIN" on, reports are an admin route; otherwise a class route. */
const reportsGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const row = await c.get("db").select({ reportsNeedPin: settings.reportsNeedPin }).from(settings).get();
  if (row?.reportsNeedPin) return requireAdmin(c, next);
  await next();
};

export const reportRoutes = new Hono<AppEnv>();

/** Lessons and marks from `from` to `to`, both included. The client adds them up (shared/report.ts). */
reportRoutes.get("/raw", reportsGate, async (c) => {
  const { from, to } = parseQuery(c, reportQuerySchema);
  const inRange = between(lessons.date, from, to);
  const db = c.get("db");
  const [lessonRows, markRows] = await db.batch([
    db.select(lessonFields).from(lessons).where(inRange).orderBy(asc(lessons.date), asc(lessons.id)),
    db
      .select(markFields)
      .from(marks)
      .innerJoin(lessons, eq(lessons.id, marks.lessonId))
      .where(inRange)
      .orderBy(asc(lessons.date), asc(marks.lessonId), asc(marks.studentId)),
  ]);
  return c.json<ReportRaw>({ lessons: lessonRows, marks: markRows });
});
