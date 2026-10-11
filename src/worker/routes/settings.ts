import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validatePointValues } from "@shared/rules.ts";
import { settingsPatchSchema } from "@shared/schemas.ts";
import type { Settings } from "@shared/types.ts";
import type { Db } from "../db/client.ts";
import { lessons, settings, teacher } from "../db/schema.ts";
import { badRequest, conflict } from "../lib/errors.ts";
import { type AppEnv, requireAdmin } from "../lib/session.ts";
import { parseJson } from "../lib/validate.ts";

/** Settings as the API shows them: the settings row plus the teacher's name. */
export function selectSettings(db: Db) {
  return db
    .select({
      teacherName: teacher.name,
      className: settings.className,
      pointsClean: settings.pointsClean,
      pointsWarning: settings.pointsWarning,
      pointsPenalty: settings.pointsPenalty,
      schoolDays: settings.schoolDays,
      soundOn: settings.soundOn,
      reportsNeedPin: settings.reportsNeedPin,
      lastBackupAt: settings.lastBackupAt,
    })
    .from(settings)
    .innerJoin(teacher, eq(teacher.id, settings.id));
}

/** The one row of `selectSettings`. Any session implies setup is done, so it is always there. */
export function onlySettings(rows: Settings[]): Settings {
  const [row] = rows;
  if (!row) throw conflict("The app isn't set up yet.");
  return row;
}

export async function readSettings(db: Db): Promise<Settings> {
  return onlySettings(await selectSettings(db));
}

// Every settings route is an admin route.
export const settingsRoutes = new Hono<AppEnv>().use(requireAdmin);

settingsRoutes.patch("/", async (c) => {
  const patch = await parseJson(c, settingsPatchSchema);
  const db = c.get("db");
  // The schema checks each value; the order rule needs the merged result.
  const merged: Settings = { ...(await readSettings(db)), ...patch };
  const problem = validatePointValues(merged);
  if (problem) throw badRequest(problem);

  const { teacherName, ...settingsPatch } = patch;
  const writes = [];
  if (Object.keys(settingsPatch).length > 0) {
    writes.push(db.update(settings).set(settingsPatch).where(eq(settings.id, 1)));
  }
  if (teacherName !== undefined) {
    writes.push(db.update(teacher).set({ name: teacherName }).where(eq(teacher.id, 1)));
  }
  const [first, ...rest] = writes;
  if (first) await db.batch([first, ...rest]);
  return c.json(merged);
});

/** "Update all past lessons": every lesson's snapshot takes the current point values. */
settingsRoutes.post("/recalculate", async (c) => {
  const db = c.get("db");
  const { pointsClean, pointsWarning, pointsPenalty } = await readSettings(db);
  const result = await db.update(lessons).set({ pointsClean, pointsWarning, pointsPenalty });
  return c.json({ updated: result.meta.changes });
});
