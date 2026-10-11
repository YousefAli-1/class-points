import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
// Type-only and relative: drizzle-kit loads this file in Node without the path aliases.
import type { ColorKey } from "../../shared/palette.ts";
import type { MarkStatus } from "../../shared/types.ts";

// Spec §7. Timestamps are epoch milliseconds (INTEGER); calendar dates are `YYYY-MM-DD` text.
// Ids use AUTOINCREMENT so a deleted student, subject or lesson id is never handed out again:
// an offline mark queued for a deleted lesson must not land on a newer one.

export const teacher = sqliteTable(
  "teacher",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    pinHash: text("pin_hash").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("teacher_single_row", sql`${t.id} = 1`)],
);

export const sessions = sqliteTable("sessions", {
  /** SHA-256 (hex) of the cookie token. The token itself is never stored. */
  idHash: text("id_hash").primaryKey(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  adminUntil: integer("admin_until"),
});

export const authAttempts = sqliteTable("auth_attempts", {
  /** `kind:ip`, e.g. `login:203.0.113.7`. */
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: integer("locked_until"),
  lockLevel: integer("lock_level").notNull().default(0),
});

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    className: text("class_name").notNull(),
    pointsClean: integer("points_clean").notNull(),
    pointsWarning: integer("points_warning").notNull(),
    pointsPenalty: integer("points_penalty").notNull(),
    schoolDays: text("school_days", { mode: "json" }).$type<number[]>().notNull(),
    soundOn: integer("sound_on", { mode: "boolean" }).notNull(),
    reportsNeedPin: integer("reports_need_pin", { mode: "boolean" }).notNull(),
    lastBackupAt: integer("last_backup_at"),
  },
  (t) => [check("settings_single_row", sql`${t.id} = 1`)],
);

export const subjects = sqliteTable("subjects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").$type<ColorKey>().notNull(),
  sortOrder: integer("sort_order").notNull(),
  archivedAt: integer("archived_at"),
});

export const students = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  color: text("color").$type<ColorKey>().notNull(),
  sortOrder: integer("sort_order").notNull(),
  activeFrom: text("active_from").notNull(),
  archivedAt: text("archived_at"),
  createdAt: integer("created_at").notNull(),
});

export const holidays = sqliteTable("holidays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  label: text("label").notNull(),
});

export const lessons = sqliteTable(
  "lessons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id),
    pointsClean: integer("points_clean").notNull(),
    pointsWarning: integer("points_warning").notNull(),
    pointsPenalty: integer("points_penalty").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique("lessons_date_subject_unique").on(t.date, t.subjectId), index("lessons_date_idx").on(t.date)],
);

export const marks = sqliteTable(
  "marks",
  {
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: text("status").$type<MarkStatus>().notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.lessonId, t.studentId] }),
    check("marks_status_valid", sql`${t.status} IN ('clean', 'warning', 'penalty', 'absent')`),
  ],
);
