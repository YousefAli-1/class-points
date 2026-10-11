import { asc, between } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { monthSchema } from "@shared/schemas.ts";
import type { CalendarResponse } from "@shared/types.ts";
import { lessons } from "../db/schema.ts";
import type { AppEnv } from "../lib/session.ts";
import { parseQuery } from "../lib/validate.ts";

const calendarQuerySchema = z.object({ month: monthSchema });

export const calendarRoutes = new Hono<AppEnv>();

/** The month's lessons, for the dots on the calendar. */
calendarRoutes.get("/", async (c) => {
  const { month } = parseQuery(c, calendarQuerySchema);
  // Dates are `YYYY-MM-DD` text, so the month is the range -01 to -31 whatever its length.
  const rows = await c
    .get("db")
    .select({ id: lessons.id, date: lessons.date, subjectId: lessons.subjectId })
    .from(lessons)
    .where(between(lessons.date, `${month}-01`, `${month}-31`))
    .orderBy(asc(lessons.date), asc(lessons.id));
  return c.json<CalendarResponse>({ lessons: rows });
});
