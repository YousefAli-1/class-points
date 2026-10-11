import { beforeEach, describe, expect, it } from "vitest";
import { AVATARS, COLOR_KEYS } from "@shared/palette.ts";
import type { Student } from "@shared/types.ts";
import {
  addStudents,
  count,
  del,
  expectError,
  expectJson,
  getBootstrap,
  getDay,
  PAST,
  patch,
  post,
  putMark,
  startLesson,
  utcDate,
} from "./data-helpers.ts";
import { adminSession, api, resetDb, setupTeacher, sql, unlock } from "./helpers.ts";

beforeEach(resetDb);

const archive = (cookie: string, id: number, date: string) =>
  api(`/api/students/${id}/archive`, { body: { date } }, cookie);

const namesOf = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

describe("POST /api/students", () => {
  it("students: bulk create assigns unique avatars and sortOrder", async () => {
    const cookie = await adminSession();

    const first = await addStudents(cookie, ["Ali", " Bea ", "Cai"], "2025-09-01");

    expect(first[0]).toEqual<Student>({
      id: 1,
      name: "Ali",
      avatar: AVATARS[0],
      color: COLOR_KEYS[0],
      sortOrder: 0,
      activeFrom: "2025-09-01",
      archivedAt: null,
    });
    expect(first.map((s) => s.name)).toEqual(["Ali", "Bea", "Cai"]);
    expect(first.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
    expect(first.map((s) => s.avatar)).toEqual(AVATARS.slice(0, 3));

    const second = await addStudents(cookie, ["Dan", "Eve"]);

    expect(second.map((s) => s.sortOrder)).toEqual([3, 4]);
    expect(second.map((s) => s.color)).toEqual(COLOR_KEYS.slice(3, 5));
    const all = (await getBootstrap(cookie)).students;
    expect(all.map((s) => s.name)).toEqual(["Ali", "Bea", "Cai", "Dan", "Eve"]);
    expect(new Set(all.map((s) => s.avatar)).size).toBe(5);
  });

  it("frees an archived student's avatar for a new student", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali", "Bea"]);
    await expectJson(archive(cookie, ali.id, PAST));

    const [cai] = await addStudents(cookie, ["Cai"]);

    expect(cai.avatar).toBe(ali.avatar);
    expect(cai.sortOrder).toBe(2);
  });

  it("allows at most 60 active students", async () => {
    const cookie = await adminSession();
    await addStudents(cookie, namesOf(58, "Kid"));

    const error = await expectError(
      api("/api/students", { body: { names: namesOf(3, "New"), activeFrom: PAST } }, cookie),
      400,
    );

    expect(error.message).toBe("A class can have up to 60 students. You can add 2 more.");
    expect(await count("students")).toBe(58);
    await addStudents(cookie, namesOf(2, "New"));
    expect(await count("students")).toBe(60);
    const full = await expectError(api("/api/students", { body: { names: ["Extra"], activeFrom: PAST } }, cookie), 400);
    expect(full.message).toBe("A class can have up to 60 students. Archive someone first.");

    // Archived students don't count.
    await expectJson(archive(cookie, 1, PAST));
    await addStudents(cookie, ["One more"]);
    // ...but restoring one over the limit is refused.
    const restore = await expectError(post("/api/students/1/restore", cookie), 400);
    expect(restore.message).toBe("A class can have up to 60 students. Archive someone first.");
  });

  it("rejects bad input", async () => {
    const cookie = await adminSession();

    await expectError(api("/api/students", { body: { names: [], activeFrom: PAST } }, cookie), 400);
    await expectError(api("/api/students", { body: { names: ["  "], activeFrom: PAST } }, cookie), 400);
    await expectError(api("/api/students", { body: { names: ["Ali"], activeFrom: "2025-02-30" } }, cookie), 400);
    expect(await count("students")).toBe(0);
  });
});

describe("PATCH /api/students/:id", () => {
  it("updates the given fields", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali"]);

    const updated = await expectJson<Student>(
      patch(`/api/students/${ali.id}`, { name: "Alia", avatar: "🐼", color: "grape", activeFrom: PAST }, cookie),
    );

    expect(updated).toEqual({ ...ali, name: "Alia", avatar: "🐼", color: "grape", activeFrom: PAST });
    expect((await getBootstrap(cookie)).students).toEqual([updated]);
    expect(await expectJson(patch(`/api/students/${ali.id}`, {}, cookie))).toEqual(updated);
  });

  it("rejects an unknown student and bad values", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali"]);

    expect((await expectError(patch("/api/students/99", { name: "X" }, cookie), 404)).code).toBe("NOT_FOUND");
    await expectError(patch(`/api/students/${ali.id}`, { color: "rainbow" }, cookie), 400);
    await expectError(patch(`/api/students/${ali.id}`, { name: "" }, cookie), 400);
  });
});

describe("POST /api/students/reorder", () => {
  it("students: reorder", async () => {
    const cookie = await adminSession();
    const [ali, bea, cai] = await addStudents(cookie, ["Ali", "Bea", "Cai"]);

    const reordered = await expectJson<Student[]>(
      api("/api/students/reorder", { body: { ids: [cai.id, ali.id, bea.id] } }, cookie),
    );

    expect(reordered.map((s) => [s.name, s.sortOrder])).toEqual([
      ["Cai", 0],
      ["Ali", 1],
      ["Bea", 2],
    ]);
    expect((await getBootstrap(cookie)).students).toEqual(reordered);
    await expectError(api("/api/students/reorder", { body: { ids: [ali.id, ali.id] } }, cookie), 400);
  });
});

describe("archive, restore and delete", () => {
  it("students: archive/restore/delete cascades marks", async () => {
    const cookie = await adminSession();
    const [ali, bea] = await addStudents(cookie, ["Ali", "Bea"]);
    const lesson = await startLesson(cookie, PAST);
    await expectJson(putMark(cookie, lesson.id, ali.id, "warning", 100));
    await expectJson(putMark(cookie, lesson.id, bea.id, "penalty", 100));

    // Archive takes the client's local today, which may be one day ahead of UTC.
    const archived = await expectJson<Student>(archive(cookie, ali.id, utcDate(1)));
    expect(archived).toEqual({ ...ali, archivedAt: utcDate(1) });
    const tooLate = await expectError(archive(cookie, bea.id, utcDate(2)), 400);
    expect(tooLate.message).toBe("That day hasn't come yet.");
    await expectError(archive(cookie, bea.id, "soon"), 400);

    const restored = await expectJson<Student>(post(`/api/students/${ali.id}/restore`, cookie));
    expect(restored).toEqual(ali);

    expect(await expectJson(del(`/api/students/${ali.id}`, cookie))).toEqual({ ok: true });
    expect((await getBootstrap(cookie)).students.map((s) => s.id)).toEqual([bea.id]);
    expect((await sql("SELECT student_id FROM marks").all()).results).toEqual([{ student_id: bea.id }]);
    expect((await getDay(cookie, PAST)).lessons[0].marks).toEqual({ [bea.id]: { status: "penalty", updatedAt: 100 } });
  });

  it("keeps the first archive date when archived again", async () => {
    const cookie = await adminSession();
    const [ali] = await addStudents(cookie, ["Ali"]);
    await expectJson(archive(cookie, ali.id, "2025-05-01"));

    const again = await expectJson<Student>(archive(cookie, ali.id, "2025-06-01"));

    expect(again.archivedAt).toBe("2025-05-01");
  });

  it("answers 404 for an unknown student", async () => {
    const cookie = await adminSession();

    await expectError(archive(cookie, 99, PAST), 404);
    await expectError(post("/api/students/99/restore", cookie), 404);
    await expectError(del("/api/students/99", cookie), 404);
  });
});

describe("admin lock", () => {
  it("students: requires admin", async () => {
    const cookie = await setupTeacher();
    const requests = [
      () => api("/api/students", { body: { names: ["Ali"], activeFrom: PAST } }, cookie),
      () => patch("/api/students/1", { name: "Al" }, cookie),
      () => api("/api/students/reorder", { body: { ids: [1] } }, cookie),
      () => archive(cookie, 1, PAST),
      () => post("/api/students/1/restore", cookie),
      () => del("/api/students/1", cookie),
    ];

    for (const send of requests) {
      expect((await expectError(send(), 403)).code).toBe("ADMIN_LOCKED");
    }

    // Unlocked it works; locked again it is refused again.
    await unlock(cookie);
    await addStudents(cookie, ["Ali"]);
    await post("/api/auth/lock", cookie);
    expect((await expectError(requests[0](), 403)).code).toBe("ADMIN_LOCKED");
    expect(await count("students")).toBe(1);
  });
});
