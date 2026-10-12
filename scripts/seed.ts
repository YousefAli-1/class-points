// `npm run seed:local`: replaces the LOCAL database with a demo class of 24 kids and a month of lessons.
// Log in with the password `teacher123`; the admin PIN is `1234`. It never runs against the remote database.
import { addDays, parseISODate, todayISO, weekdayOf } from "../src/shared/dates.ts";
import { DEFAULT_SUBJECTS, pickAvatars } from "../src/shared/palette.ts";
import { DEFAULT_POINTS } from "../src/shared/rules.ts";
import type { MarkStatus } from "../src/shared/types.ts";
import { hashSecret } from "../src/worker/lib/crypto.ts";
import { executeOnD1, insertRows, type SqlValue } from "./lib/d1.ts";

if (process.argv.includes("--remote")) {
  console.error("The seed only writes the local database. It never touches the remote one.");
  process.exit(1);
}

const PASSWORD = "teacher123";
const PIN = "1234";
const SCHOOL_DAYS = [0, 1, 2, 3, 4]; // Sunday to Thursday
const DAYS_OF_HISTORY = 30;
const STUDENT_NAMES = [
  "Adam", "Aisha", "Ali", "Amira", "Bilal", "Dana", "Ethan", "Fatima",
  "Hamza", "Hana", "Ibrahim", "Jana", "Karim", "Layla", "Liam", "Maya",
  "Noah", "Nour", "Omar", "Rania", "Sami", "Sara", "Yusuf", "Zara",
];

/** mulberry32: a tiny seeded PRNG, so the same day always gets the same marks. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = prng(20261011);
const now = Date.now();
const today = todayISO();

// The school days of the last 30 days, not counting today, so today is still fresh to start.
const pastSchoolDays: string[] = [];
for (let n = DAYS_OF_HISTORY; n >= 1; n--) {
  const date = addDays(today, -n);
  if (SCHOOL_DAYS.includes(weekdayOf(date))) pastSchoolDays.push(date);
}

// A two-day break starting on the school day nearest two weeks ago.
const holidayStart = pastSchoolDays.find((d) => d >= addDays(today, -14)) ?? pastSchoolDays[0];
const holiday = { id: 1, startDate: holidayStart, endDate: addDays(holidayStart, 1), label: "Mid-term break" };
const lessonDays = pastSchoolDays.filter((d) => d < holiday.startDate || d > holiday.endDate);

const looks = pickAvatars(STUDENT_NAMES.length, []);
const students = STUDENT_NAMES.map((name, i) => ({ id: i + 1, name, ...looks[i] }));
const subjects = DEFAULT_SUBJECTS.map((s, i) => ({ id: i + 1, ...s }));

const lessonRows: SqlValue[][] = [];
const markRows: SqlValue[][] = [];
for (const date of lessonDays) {
  const absent = new Set(students.filter(() => random() < 0.04).map((s) => s.id));
  for (const [i, subject] of subjects.entries()) {
    const lessonId = lessonRows.length + 1;
    const start = parseISODate(date);
    start.setHours(8 + i);
    const createdAt = start.getTime();
    lessonRows.push([lessonId, date, subject.id, DEFAULT_POINTS.pointsClean, DEFAULT_POINTS.pointsWarning, DEFAULT_POINTS.pointsPenalty, createdAt]);
    for (const student of students) {
      const r = random();
      // No row means clean, as in the app.
      const status: MarkStatus | null = absent.has(student.id) ? "absent" : r < 0.04 ? "penalty" : r < 0.13 ? "warning" : null;
      if (status) markRows.push([lessonId, student.id, status, createdAt + Math.ceil(random() * 45) * 60_000]);
    }
  }
}

const [passwordHash, pinHash] = await Promise.all([hashSecret(PASSWORD), hashSecret(PIN)]);
const statements = [
  // Children first, for the foreign keys. Sessions stay, so a signed-in browser stays signed in.
  "DELETE FROM marks;",
  "DELETE FROM lessons;",
  "DELETE FROM students;",
  "DELETE FROM subjects;",
  "DELETE FROM holidays;",
  "DELETE FROM settings;",
  "DELETE FROM teacher;",
  "DELETE FROM auth_attempts;",
  ...insertRows("teacher", ["id", "name", "password_hash", "pin_hash", "created_at"], [[1, "Ms. Huda", passwordHash, pinHash, now]]),
  ...insertRows(
    "settings",
    ["id", "class_name", "points_clean", "points_warning", "points_penalty", "school_days", "sound_on", "reports_need_pin", "last_backup_at"],
    [[1, "Class 3A", DEFAULT_POINTS.pointsClean, DEFAULT_POINTS.pointsWarning, DEFAULT_POINTS.pointsPenalty, JSON.stringify(SCHOOL_DAYS), true, false, null]],
  ),
  ...insertRows(
    "subjects",
    ["id", "name", "emoji", "color", "sort_order", "archived_at"],
    subjects.map((s, i) => [s.id, s.name, s.emoji, s.color, i, null]),
  ),
  ...insertRows(
    "students",
    ["id", "name", "avatar", "color", "sort_order", "active_from", "archived_at", "created_at"],
    students.map((s, i) => [s.id, s.name, s.avatar, s.color, i, addDays(today, -60), null, now]),
  ),
  ...insertRows("holidays", ["id", "start_date", "end_date", "label"], [[holiday.id, holiday.startDate, holiday.endDate, holiday.label]]),
  ...insertRows("lessons", ["id", "date", "subject_id", "points_clean", "points_warning", "points_penalty", "created_at"], lessonRows),
  ...insertRows("marks", ["lesson_id", "student_id", "status", "updated_at"], markRows),
];

executeOnD1(statements, "local");
console.log(
  `\nSeeded the local database: ${students.length} students, ${subjects.length} subjects, ${lessonRows.length} lessons ` +
    `on ${lessonDays.length} school days, ${markRows.length} marks, holiday ${holiday.startDate} to ${holiday.endDate}.` +
    `\nLog in with the password "${PASSWORD}". The admin PIN is ${PIN}.`,
);
