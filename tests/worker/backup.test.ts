import { beforeEach, describe, expect, it } from "vitest";
import type { BackupFile, Holiday, Mark } from "@shared/types.ts";
import {
  addStudents,
  expectError,
  expectJson,
  getBootstrap,
  lessonOf,
  PAST,
  putMark,
  startLesson,
} from "./data-helpers.ts";
import { adminSession, api, resetDb, setupTeacher, sql } from "./helpers.ts";

beforeEach(resetDb);

const lastBackupAt = () => sql("SELECT last_backup_at FROM settings").first("last_backup_at");

describe("GET /api/backup", () => {
  it("backup: contains all tables and sets lastBackupAt", async () => {
    const cookie = await adminSession();
    const [ali, bea] = await addStudents(cookie, ["Ali", "Bea"]);
    await expectJson(api(`/api/students/${bea.id}/archive`, { body: { date: "2025-06-01" } }, cookie));
    await expectJson<Holiday>(
      api("/api/holidays", { body: { startDate: "2025-12-20", endDate: "2026-01-04", label: "Winter break" } }, cookie),
      201,
    );
    const lesson = await startLesson(cookie, PAST);
    await expectJson(putMark(cookie, lesson.id, ali.id, "penalty", 100));
    await expectJson(putMark(cookie, lesson.id, bea.id, "absent", 110));
    expect(await lastBackupAt()).toBeNull();
    const before = Date.now();

    const backup = await expectJson<BackupFile>(api("/api/backup", {}, cookie));

    expect(Object.keys(backup).sort()).toEqual([
      "exportedAt",
      "holidays",
      "lessons",
      "marks",
      "settings",
      "students",
      "subjects",
      "version",
    ]);
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBeGreaterThanOrEqual(before);
    expect(backup.exportedAt).toBeLessThanOrEqual(Date.now());
    expect(await lastBackupAt()).toBe(backup.exportedAt);

    const boot = await getBootstrap(cookie);
    expect(backup.settings).toEqual({ ...boot.settings, lastBackupAt: backup.exportedAt });
    expect(backup.subjects).toEqual(boot.subjects);
    expect(backup.students).toEqual(boot.students);
    expect(backup.holidays).toEqual(boot.holidays);
    expect(backup.lessons).toEqual([lessonOf(lesson)]);
    expect(backup.marks).toEqual<Mark[]>([
      { lessonId: lesson.id, studentId: ali.id, status: "penalty", updatedAt: 100 },
      { lessonId: lesson.id, studentId: bea.id, status: "absent", updatedAt: 110 },
    ]);
    // Teacher-facing data only: no secrets or sessions.
    expect(JSON.stringify(backup)).not.toMatch(/pbkdf2|password|pin_hash|id_hash/i);
  });

  it("needs the admin unlock", async () => {
    const cookie = await setupTeacher();

    expect((await expectError(api("/api/backup", {}, cookie), 403)).code).toBe("ADMIN_LOCKED");
    expect(await lastBackupAt()).toBeNull();
  });
});
