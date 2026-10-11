import { and, asc, eq, isNull, max, ne } from "drizzle-orm";
import { Hono } from "hono";
import { reorderSchema, subjectCreateSchema, subjectPatchSchema } from "@shared/schemas.ts";
import type { Subject } from "@shared/types.ts";
import type { Db } from "../db/client.ts";
import { lessons, subjects } from "../db/schema.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { type AppEnv, requireAdmin } from "../lib/session.ts";
import { parseJson } from "../lib/validate.ts";

/** Every subject, archived ones included, in menu order. */
export function selectSubjects(db: Db) {
  return db.select().from(subjects).orderBy(asc(subjects.sortOrder), asc(subjects.id));
}

async function findSubject(db: Db, id: number): Promise<Subject> {
  const row = await db.select().from(subjects).where(eq(subjects.id, id)).get();
  if (!row) throw notFound("Subject");
  return row;
}

/** Spec §4.4: there is always at least one active subject. Throws if `subject` is the last one. */
async function assertNotLastActive(db: Db, subject: Subject): Promise<void> {
  if (subject.archivedAt !== null) return;
  const other = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(isNull(subjects.archivedAt), ne(subjects.id, subject.id)))
    .get();
  if (!other) throw badRequest("Keep at least one subject.");
}

// Every subject route is an admin route.
export const subjectRoutes = new Hono<AppEnv>().use(requireAdmin);

subjectRoutes.post("/", async (c) => {
  const body = await parseJson(c, subjectCreateSchema);
  const db = c.get("db");
  const last = await db.select({ sortOrder: max(subjects.sortOrder) }).from(subjects).get();
  const [row] = await db
    .insert(subjects)
    .values({ ...body, sortOrder: (last?.sortOrder ?? -1) + 1, archivedAt: null })
    .returning();
  return c.json<Subject>(row, 201);
});

subjectRoutes.post("/reorder", async (c) => {
  const { ids } = await parseJson(c, reorderSchema);
  const db = c.get("db");
  const [first, ...rest] = ids.map((id, sortOrder) => db.update(subjects).set({ sortOrder }).where(eq(subjects.id, id)));
  await db.batch([first, ...rest]);
  return c.json<Subject[]>(await selectSubjects(db));
});

subjectRoutes.patch("/:id{[0-9]+}", async (c) => {
  const patch = await parseJson(c, subjectPatchSchema);
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  if (Object.keys(patch).length === 0) return c.json(await findSubject(db, id));
  const [row] = await db.update(subjects).set(patch).where(eq(subjects.id, id)).returning();
  if (!row) throw notFound("Subject");
  return c.json<Subject>(row);
});

/** Archived subjects leave the day-view menu but stay in reports. Archiving again keeps the first time. */
subjectRoutes.post("/:id{[0-9]+}/archive", async (c) => {
  const db = c.get("db");
  const subject = await findSubject(db, Number(c.req.param("id")));
  if (subject.archivedAt !== null) return c.json(subject);
  await assertNotLastActive(db, subject);
  const archivedAt = Date.now();
  await db.update(subjects).set({ archivedAt }).where(eq(subjects.id, subject.id));
  return c.json<Subject>({ ...subject, archivedAt });
});

subjectRoutes.post("/:id{[0-9]+}/restore", async (c) => {
  const db = c.get("db");
  const subject = await findSubject(db, Number(c.req.param("id")));
  if (subject.archivedAt === null) return c.json(subject);
  await db.update(subjects).set({ archivedAt: null }).where(eq(subjects.id, subject.id));
  return c.json<Subject>({ ...subject, archivedAt: null });
});

/** Delete forever: only a subject that was never taught (otherwise archive it). */
subjectRoutes.delete("/:id{[0-9]+}", async (c) => {
  const db = c.get("db");
  const subject = await findSubject(db, Number(c.req.param("id")));
  const lesson = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.subjectId, subject.id)).get();
  if (lesson) throw conflict("This subject has lessons, so it can't be deleted. You can archive it instead.");
  await assertNotLastActive(db, subject);
  await db.delete(subjects).where(eq(subjects.id, subject.id));
  return c.json({ ok: true });
});
