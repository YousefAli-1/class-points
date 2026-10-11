import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { isoDateSchema } from "@shared/schemas.ts";
import type { DayResponse } from "@shared/types.ts";
import { lessons } from "../db/schema.ts";
import type { AppEnv } from "../lib/session.ts";
import { loadDayLessons } from "./lessons.ts";

export const dayRoutes = new Hono<AppEnv>();

/** One day's lessons with every mark: what the day view needs. */
dayRoutes.get("/:date", async (c) => {
  // A ZodError becomes a 400 with the schema's message (app.ts onError).
  const date = isoDateSchema.parse(c.req.param("date"));
  const dayLessons = await loadDayLessons(c.get("db"), eq(lessons.date, date));
  return c.json<DayResponse>({ date, lessons: dayLessons });
});
