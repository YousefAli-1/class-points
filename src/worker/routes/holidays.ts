import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { holidayCreateSchema } from "@shared/schemas.ts";
import type { Holiday } from "@shared/types.ts";
import type { Db } from "../db/client.ts";
import { holidays } from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";
import { type AppEnv, requireAdmin } from "../lib/session.ts";
import { parseJson } from "../lib/validate.ts";

/** Every holiday, earliest first. */
export function selectHolidays(db: Db) {
  return db.select().from(holidays).orderBy(asc(holidays.startDate), asc(holidays.id));
}

// Every holiday route is an admin route.
export const holidayRoutes = new Hono<AppEnv>().use(requireAdmin);

holidayRoutes.post("/", async (c) => {
  const body = await parseJson(c, holidayCreateSchema);
  const [row] = await c.get("db").insert(holidays).values(body).returning();
  return c.json<Holiday>(row, 201);
});

holidayRoutes.delete("/:id{[0-9]+}", async (c) => {
  const deleted = await c
    .get("db")
    .delete(holidays)
    .where(eq(holidays.id, Number(c.req.param("id"))))
    .returning({ id: holidays.id });
  if (deleted.length === 0) throw notFound("Holiday");
  return c.json({ ok: true });
});
