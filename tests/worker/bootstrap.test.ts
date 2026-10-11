import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_POINTS } from "@shared/rules.ts";
import type { Bootstrap, Holiday, Student, Subject } from "@shared/types.ts";
import {
  addStudents,
  expectError,
  expectJson,
  getBootstrap,
  PAST,
  post,
  putMark,
  startLesson,
} from "./data-helpers.ts";
import { adminSession, api, resetDb, setupTeacher, sql } from "./helpers.ts";

beforeEach(resetDb);

describe("bootstrap", () => {
  it("bootstrap returns settings, subjects incl archived, students incl archived, holidays", async () => {
    const cookie = await adminSession();
    const [ali, bea] = await addStudents(cookie, ["Ali", "Bea"]);
    await expectJson(api(`/api/students/${bea.id}/archive`, { body: { date: "2025-06-01" } }, cookie));
    const science = await expectJson<Subject>(post("/api/subjects/3/archive", cookie));
    const holiday = await expectJson<Holiday>(
      api("/api/holidays", { body: { startDate: "2025-12-20", endDate: "2026-01-04", label: "Winter break" } }, cookie),
      201,
    );

    const boot = await getBootstrap(cookie);

    expect(boot.settings).toEqual({
      teacherName: "Ms Green",
      className: "Class 3B",
      ...DEFAULT_POINTS,
      schoolDays: [0, 1, 2, 3, 4],
      soundOn: true,
      reportsNeedPin: false,
      lastBackupAt: null,
    });
    expect(boot.subjects).toEqual<Subject[]>([
      { id: 1, name: "English", emoji: "📚", color: "sky", sortOrder: 0, archivedAt: null },
      { id: 2, name: "Mathematics", emoji: "🔢", color: "sunshine", sortOrder: 1, archivedAt: null },
      { id: 3, name: "Science", emoji: "🔬", color: "leaf", sortOrder: 2, archivedAt: science.archivedAt },
    ]);
    expect(science.archivedAt).toEqual(expect.any(Number));
    expect(boot.students).toEqual<Student[]>([ali, { ...bea, archivedAt: "2025-06-01" }]);
    expect(Object.keys(boot.students[0]).sort()).toEqual([
      "activeFrom",
      "archivedAt",
      "avatar",
      "color",
      "id",
      "name",
      "sortOrder",
    ]);
    expect(boot.holidays).toEqual([holiday]);
    expect(Object.keys(boot).sort()).toEqual(["holidays", "settings", "students", "subjects"]);
  });

  it("lists students and subjects in their sort order", async () => {
    const cookie = await adminSession();
    const [ali, bea] = await addStudents(cookie, ["Ali", "Bea"]);
    await expectJson(api("/api/students/reorder", { body: { ids: [bea.id, ali.id] } }, cookie));
    await expectJson(api("/api/subjects/reorder", { body: { ids: [3, 1, 2] } }, cookie));

    const boot = await getBootstrap(cookie);

    expect(boot.students.map((s) => s.name)).toEqual(["Bea", "Ali"]);
    expect(boot.subjects.map((s) => s.id)).toEqual([3, 1, 2]);
  });
});

describe("access rules", () => {
  /** Every data route, with a body each would accept, so only the access check can fail. */
  const DATA_ROUTES: [method: string, path: string, body?: unknown][] = [
    ["GET", "/api/bootstrap"],
    ["PATCH", "/api/settings", { soundOn: false }],
    ["POST", "/api/settings/recalculate"],
    ["POST", "/api/students", { names: ["Ali"], activeFrom: PAST }],
    ["PATCH", "/api/students/1", { name: "Al" }],
    ["POST", "/api/students/reorder", { ids: [1] }],
    ["POST", "/api/students/1/archive", { date: PAST }],
    ["POST", "/api/students/1/restore"],
    ["DELETE", "/api/students/1"],
    ["POST", "/api/subjects", { name: "Art", emoji: "🎨", color: "coral" }],
    ["PATCH", "/api/subjects/1", { name: "Reading" }],
    ["POST", "/api/subjects/reorder", { ids: [1] }],
    ["POST", "/api/subjects/1/archive"],
    ["POST", "/api/subjects/1/restore"],
    ["DELETE", "/api/subjects/1"],
    ["POST", "/api/holidays", { startDate: PAST, endDate: PAST, label: "Snow day" }],
    ["DELETE", "/api/holidays/1"],
    ["GET", "/api/calendar?month=2025-03"],
    ["GET", `/api/days/${PAST}`],
    ["POST", "/api/lessons", { date: PAST, subjectId: 1 }],
    ["DELETE", "/api/lessons/1"],
    ["PUT", "/api/lessons/1/marks/1", { status: "warning", clientTs: 1 }],
    ["GET", "/api/reports/raw?from=2025-03-01&to=2025-03-31"],
    ["GET", "/api/backup"],
  ];

  const ADMIN_ROUTES = DATA_ROUTES.filter(
    ([, path]) => !/^\/api\/(bootstrap|calendar|days|lessons|reports)\b/.test(path),
  );

  const send = ([method, path, body]: (typeof DATA_ROUTES)[number], cookie?: string) =>
    api(path, { method, body: method === "GET" ? undefined : (body ?? {}) }, cookie);

  it("all data routes 401 without session", async () => {
    await setupTeacher();

    for (const route of DATA_ROUTES) {
      const res = await send(route);
      expect(res.status, `${route[0]} ${route[1]}`).toBe(401);
      expect((await expectError(res, 401)).code).toBe("UNAUTHORIZED");
    }
    expect(await sql("SELECT count(*) AS n FROM students").first("n")).toBe(0);
  });

  it("admin routes 403 ADMIN_LOCKED until the PIN unlock", async () => {
    const cookie = await setupTeacher();

    expect(ADMIN_ROUTES.length).toBe(17);
    for (const route of ADMIN_ROUTES) {
      const res = await send(route, cookie);
      expect(res.status, `${route[0]} ${route[1]}`).toBe(403);
      expect((await expectError(res, 403)).code).toBe("ADMIN_LOCKED");
    }
    expect(await sql("SELECT count(*) AS n FROM students").first("n")).toBe(0);
  });

  it("class routes work without the admin unlock", async () => {
    const cookie = await setupTeacher();
    await sql(
      "INSERT INTO students (name, avatar, color, sort_order, active_from, created_at) VALUES ('Ali', '🦊', 'leaf', 0, '2025-01-01', 0)",
    ).run();

    await expectJson<Bootstrap>(api("/api/bootstrap", {}, cookie));
    const lesson = await startLesson(cookie, PAST);
    await expectJson(putMark(cookie, lesson.id, 1, "warning", 1));
    await expectJson(api(`/api/days/${PAST}`, {}, cookie));
    await expectJson(api("/api/calendar?month=2025-03", {}, cookie));
    await expectJson(api("/api/reports/raw?from=2025-03-01&to=2025-03-31", {}, cookie));
    await expectJson(api(`/api/lessons/${lesson.id}`, { method: "DELETE" }, cookie));
  });
});
