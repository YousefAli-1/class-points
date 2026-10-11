import { asc, count, eq, isNull, max } from "drizzle-orm";
import { Hono } from "hono";
import { pickAvatars } from "@shared/palette.ts";
import { archiveSchema, reorderSchema, studentPatchSchema, studentsCreateSchema } from "@shared/schemas.ts";
import type { Student } from "@shared/types.ts";
import type { Db } from "../db/client.ts";
import { students } from "../db/schema.ts";
import { badRequest, notFound } from "../lib/errors.ts";
import { type AppEnv, requireAdmin } from "../lib/session.ts";
import { parseJson } from "../lib/validate.ts";
import { assertDayHasCome } from "./lessons.ts";

/** Spec §4.3. Archived students don't count. */
const MAX_ACTIVE_STUDENTS = 60;
const CLASS_IS_FULL = `A class can have up to ${MAX_ACTIVE_STUDENTS} students.`;
const ARCHIVE_FIRST = `${CLASS_IS_FULL} Archive someone first.`;

/** The API's Student: the row without its internal `createdAt`. */
export const studentFields = {
  id: students.id,
  name: students.name,
  avatar: students.avatar,
  color: students.color,
  sortOrder: students.sortOrder,
  activeFrom: students.activeFrom,
  archivedAt: students.archivedAt,
};

/** Every student, archived ones included, in class order. */
export function selectStudents(db: Db) {
  return db.select(studentFields).from(students).orderBy(asc(students.sortOrder), asc(students.id));
}

async function findStudent(db: Db, id: number): Promise<Student> {
  const row = await db.select(studentFields).from(students).where(eq(students.id, id)).get();
  if (!row) throw notFound("Student");
  return row;
}

async function countActive(db: Db): Promise<number> {
  const row = await db.select({ n: count() }).from(students).where(isNull(students.archivedAt)).get();
  return row?.n ?? 0;
}

// Every student route is an admin route.
export const studentRoutes = new Hono<AppEnv>().use(requireAdmin);

/** Bulk add. Avatars avoid the ones active students wear; archived students' avatars are free again. */
studentRoutes.post("/", async (c) => {
  const { names, activeFrom } = await parseJson(c, studentsCreateSchema);
  const db = c.get("db");
  const [active, [last]] = await db.batch([
    db.select({ avatar: students.avatar }).from(students).where(isNull(students.archivedAt)),
    db.select({ sortOrder: max(students.sortOrder) }).from(students),
  ]);
  const room = MAX_ACTIVE_STUDENTS - active.length;
  if (names.length > room) throw badRequest(room > 0 ? `${CLASS_IS_FULL} You can add ${room} more.` : ARCHIVE_FIRST);

  const firstSortOrder = (last?.sortOrder ?? -1) + 1;
  const looks = pickAvatars(names.length, active.map((s) => s.avatar));
  const createdAt = Date.now();
  // One statement per student: D1 caps the bound parameters of a single statement.
  const [first, ...rest] = names.map((name, i) =>
    db
      .insert(students)
      .values({ name, ...looks[i], sortOrder: firstSortOrder + i, activeFrom, archivedAt: null, createdAt })
      .returning(studentFields),
  );
  const created = await db.batch([first, ...rest]);
  return c.json<Student[]>(created.flat(), 201);
});

studentRoutes.post("/reorder", async (c) => {
  const { ids } = await parseJson(c, reorderSchema);
  const db = c.get("db");
  const [first, ...rest] = ids.map((id, sortOrder) => db.update(students).set({ sortOrder }).where(eq(students.id, id)));
  await db.batch([first, ...rest]);
  return c.json<Student[]>(await selectStudents(db));
});

studentRoutes.patch("/:id{[0-9]+}", async (c) => {
  const patch = await parseJson(c, studentPatchSchema);
  const db = c.get("db");
  const id = Number(c.req.param("id"));
  if (Object.keys(patch).length === 0) return c.json(await findStudent(db, id));
  const [row] = await db.update(students).set(patch).where(eq(students.id, id)).returning(studentFields);
  if (!row) throw notFound("Student");
  return c.json<Student>(row);
});

/**
 * `date` is the client's local today: from that day on the student is out of lessons.
 * Archiving again keeps the first date.
 */
studentRoutes.post("/:id{[0-9]+}/archive", async (c) => {
  const { date } = await parseJson(c, archiveSchema);
  assertDayHasCome(date);
  const db = c.get("db");
  const student = await findStudent(db, Number(c.req.param("id")));
  if (student.archivedAt !== null) return c.json(student);
  await db.update(students).set({ archivedAt: date }).where(eq(students.id, student.id));
  return c.json<Student>({ ...student, archivedAt: date });
});

studentRoutes.post("/:id{[0-9]+}/restore", async (c) => {
  const db = c.get("db");
  const student = await findStudent(db, Number(c.req.param("id")));
  if (student.archivedAt === null) return c.json(student);
  if ((await countActive(db)) >= MAX_ACTIVE_STUDENTS) throw badRequest(ARCHIVE_FIRST);
  await db.update(students).set({ archivedAt: null }).where(eq(students.id, student.id));
  return c.json<Student>({ ...student, archivedAt: null });
});

/** Delete forever. Their marks go too (ON DELETE CASCADE). */
studentRoutes.delete("/:id{[0-9]+}", async (c) => {
  const deleted = await c
    .get("db")
    .delete(students)
    .where(eq(students.id, Number(c.req.param("id"))))
    .returning({ id: students.id });
  if (deleted.length === 0) throw notFound("Student");
  return c.json({ ok: true });
});
