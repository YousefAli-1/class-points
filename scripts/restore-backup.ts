// `npm run restore:backup -- <backup.json> [--remote] --yes`
// Replaces all class data (settings, subjects, students, holidays, lessons, marks) with a backup file from
// Admin → Backup. The teacher's password, PIN and sessions stay as they are, so the app must already be set up.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { COLOR_KEYS } from "../src/shared/palette.ts";
import { executeOnD1, insertRows, sql } from "./lib/d1.ts";

const USAGE = "Usage: npm run restore:backup -- <backup.json> [--remote] --yes";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const files = args.filter((a) => !a.startsWith("--"));
const unknown = [...flags].filter((f) => f !== "--remote" && f !== "--yes");
if (files.length !== 1 || unknown.length > 0) {
  console.error(unknown.length > 0 ? `Unknown option ${unknown.join(", ")}.\n${USAGE}` : USAGE);
  process.exit(1);
}
const target = flags.has("--remote") ? "remote" : "local";

const int = z.int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const color = z.enum(COLOR_KEYS);
const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: int,
  settings: z.object({
    teacherName: z.string(),
    className: z.string(),
    pointsClean: int,
    pointsWarning: int,
    pointsPenalty: int,
    schoolDays: z.array(int.min(0).max(6)),
    soundOn: z.boolean(),
    reportsNeedPin: z.boolean(),
    lastBackupAt: int.nullable(),
  }),
  subjects: z.array(
    z.object({ id: int, name: z.string(), emoji: z.string(), color, sortOrder: int, archivedAt: int.nullable() }),
  ),
  students: z.array(
    z.object({
      id: int,
      name: z.string(),
      avatar: z.string(),
      color,
      sortOrder: int,
      activeFrom: isoDate,
      archivedAt: isoDate.nullable(),
    }),
  ),
  holidays: z.array(z.object({ id: int, startDate: isoDate, endDate: isoDate, label: z.string() })),
  lessons: z.array(
    z.object({ id: int, date: isoDate, subjectId: int, pointsClean: int, pointsWarning: int, pointsPenalty: int }),
  ),
  marks: z.array(
    z.object({ lessonId: int, studentId: int, status: z.enum(["clean", "warning", "penalty", "absent"]), updatedAt: int }),
  ),
});

let backup: z.infer<typeof backupSchema>;
try {
  backup = backupSchema.parse(JSON.parse(readFileSync(files[0], "utf8")));
} catch (err) {
  console.error(`${files[0]} is not a Class Points backup file:\n${err instanceof z.ZodError ? z.prettifyError(err) : String(err)}`);
  process.exit(1);
}

const { settings } = backup;
console.log(`Backup of "${settings.className}" (${settings.teacherName}), made ${new Date(backup.exportedAt).toISOString()}:`);
console.log(`  ${backup.subjects.length} subjects, ${backup.students.length} students, ${backup.holidays.length} holidays`);
console.log(`  ${backup.lessons.length} lessons, ${backup.marks.length} marks`);
if (!flags.has("--yes")) {
  console.log(`\nNothing changed. Add --yes to replace ALL class data in the ${target} database with this backup.`);
  process.exit(1);
}

// The backup leaves out the internal created_at columns, which are NOT NULL: students get the backup's
// time, and lessons get noon UTC on their own date.
const statements = [
  "DELETE FROM marks;",
  "DELETE FROM lessons;",
  "DELETE FROM students;",
  "DELETE FROM subjects;",
  "DELETE FROM holidays;",
  "DELETE FROM settings;",
  ...insertRows(
    "settings",
    ["id", "class_name", "points_clean", "points_warning", "points_penalty", "school_days", "sound_on", "reports_need_pin", "last_backup_at"],
    [
      [
        1,
        settings.className,
        settings.pointsClean,
        settings.pointsWarning,
        settings.pointsPenalty,
        JSON.stringify(settings.schoolDays),
        settings.soundOn,
        settings.reportsNeedPin,
        settings.lastBackupAt,
      ],
    ],
  ),
  `UPDATE teacher SET name = ${sql(settings.teacherName)} WHERE id = 1;`,
  ...insertRows(
    "subjects",
    ["id", "name", "emoji", "color", "sort_order", "archived_at"],
    backup.subjects.map((s) => [s.id, s.name, s.emoji, s.color, s.sortOrder, s.archivedAt]),
  ),
  ...insertRows(
    "students",
    ["id", "name", "avatar", "color", "sort_order", "active_from", "archived_at", "created_at"],
    backup.students.map((s) => [s.id, s.name, s.avatar, s.color, s.sortOrder, s.activeFrom, s.archivedAt, backup.exportedAt]),
  ),
  ...insertRows(
    "holidays",
    ["id", "start_date", "end_date", "label"],
    backup.holidays.map((h) => [h.id, h.startDate, h.endDate, h.label]),
  ),
  ...insertRows(
    "lessons",
    ["id", "date", "subject_id", "points_clean", "points_warning", "points_penalty", "created_at"],
    backup.lessons.map((l) => [l.id, l.date, l.subjectId, l.pointsClean, l.pointsWarning, l.pointsPenalty, Date.parse(`${l.date}T12:00:00Z`)]),
  ),
  ...insertRows(
    "marks",
    ["lesson_id", "student_id", "status", "updated_at"],
    backup.marks.map((m) => [m.lessonId, m.studentId, m.status, m.updatedAt]),
  ),
];

executeOnD1(statements, target);
console.log(`\nRestored the ${target} database from ${files[0]}.`);
