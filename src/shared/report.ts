import { hasPenaltyCard, hasWarningCard, isEligible, pointsFor } from "./rules.ts";
import type { ISODate, Lesson, Mark, MarkStatus, Student } from "./types.ts";

export interface Tally {
  points: number;
  clean: number;
  /** Lessons with a Warning card, including those that also have a Penalty. */
  warnings: number;
  penalties: number;
  absences: number;
  /** Lessons the student belonged to, absences included. */
  lessons: number;
}

export interface StudentRow extends Tally {
  studentId: number;
  /** lessons − absences */
  attended: number;
  /** Keyed by subject id; only subjects with at least one of the student's lessons. */
  bySubject: Record<number, Tally>;
}

export interface ClassReport {
  /** Lessons in the report (after the subject filter). */
  lessonsHeld: number;
  /** Students who belonged to at least one lesson, ordered by sortOrder. */
  rows: StudentRow[];
  /** Sum of all rows; `lessons` counts student-lessons. */
  totals: Tally;
  /** Dense ranking on points over students who attended at least once. Ties share a place. */
  podium: { place: 1 | 2 | 3; points: number; studentIds: number[] }[];
}

export interface StudentEntry {
  date: ISODate;
  lessonId: number;
  subjectId: number;
  status: MarkStatus;
  /** `null` when absent. */
  points: number | null;
}

export interface StudentReport {
  row: StudentRow | null;
  /** Every lesson the student belonged to, by date then lesson id. */
  entries: StudentEntry[];
  /** One item per date with entries, in date order. Absent lessons add 0. */
  perDay: { date: ISODate; total: number; bySubject: Record<number, number> }[];
}

const PLACES = [1, 2, 3] as const;

function emptyTally(): Tally {
  return { points: 0, clean: 0, warnings: 0, penalties: 0, absences: 0, lessons: 0 };
}

function countEntry(tally: Tally, entry: StudentEntry): void {
  tally.lessons++;
  if (entry.status === "absent") {
    tally.absences++;
    return;
  }
  tally.points += entry.points ?? 0;
  if (entry.status === "clean") tally.clean++;
  if (hasWarningCard(entry.status)) tally.warnings++;
  if (hasPenaltyCard(entry.status)) tally.penalties++;
}

function addTally(target: Tally, t: Tally): void {
  target.points += t.points;
  target.clean += t.clean;
  target.warnings += t.warnings;
  target.penalties += t.penalties;
  target.absences += t.absences;
  target.lessons += t.lessons;
}

/** Lessons that pass the subject filter, by date then id. */
function selectLessons(lessons: readonly Lesson[], subjectIds?: readonly number[]): Lesson[] {
  const wanted = subjectIds ? new Set(subjectIds) : null;
  return lessons
    .filter((l) => !wanted || wanted.has(l.subjectId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

/** Status lookup; a missing mark means `clean`. */
function statusLookup(marks: readonly Mark[]): (lessonId: number, studentId: number) => MarkStatus {
  const byKey = new Map<string, MarkStatus>();
  for (const m of marks) byKey.set(`${m.lessonId}:${m.studentId}`, m.status);
  return (lessonId, studentId) => byKey.get(`${lessonId}:${studentId}`) ?? "clean";
}

/** One entry per lesson the student belonged to. Points use the lesson's snapshot. */
function entriesFor(
  student: Student,
  lessons: readonly Lesson[],
  statusOf: (lessonId: number, studentId: number) => MarkStatus,
): StudentEntry[] {
  return lessons
    .filter((lesson) => isEligible(student, lesson.date))
    .map((lesson) => {
      const status = statusOf(lesson.id, student.id);
      return { date: lesson.date, lessonId: lesson.id, subjectId: lesson.subjectId, status, points: pointsFor(status, lesson) };
    });
}

function rowFor(studentId: number, entries: readonly StudentEntry[]): StudentRow | null {
  if (entries.length === 0) return null;
  const row: StudentRow = { studentId, ...emptyTally(), attended: 0, bySubject: {} };
  for (const entry of entries) {
    countEntry(row, entry);
    countEntry((row.bySubject[entry.subjectId] ??= emptyTally()), entry);
  }
  row.attended = row.lessons - row.absences;
  return row;
}

function podiumFor(rows: readonly StudentRow[]): ClassReport["podium"] {
  const ranked = rows.filter((r) => r.attended > 0);
  const topScores = [...new Set(ranked.map((r) => r.points))].sort((a, b) => b - a).slice(0, PLACES.length);
  return topScores.map((points, i) => ({
    place: PLACES[i],
    points,
    studentIds: ranked.filter((r) => r.points === points).map((r) => r.studentId),
  }));
}

export function buildClassReport(input: {
  lessons: readonly Lesson[];
  marks: readonly Mark[];
  students: readonly Student[];
  subjectIds?: readonly number[];
}): ClassReport {
  const lessons = selectLessons(input.lessons, input.subjectIds);
  const statusOf = statusLookup(input.marks);
  const students = [...input.students].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const rows: StudentRow[] = [];
  for (const student of students) {
    const row = rowFor(student.id, entriesFor(student, lessons, statusOf));
    if (row) rows.push(row);
  }

  const totals = emptyTally();
  for (const row of rows) addTally(totals, row);

  return { lessonsHeld: lessons.length, rows, totals, podium: podiumFor(rows) };
}

export function buildStudentReport(input: {
  lessons: readonly Lesson[];
  marks: readonly Mark[];
  student: Student;
  subjectIds?: readonly number[];
}): StudentReport {
  const lessons = selectLessons(input.lessons, input.subjectIds);
  const entries = entriesFor(input.student, lessons, statusLookup(input.marks));

  const perDay: StudentReport["perDay"] = [];
  for (const entry of entries) {
    let day = perDay.at(-1);
    if (!day || day.date !== entry.date) {
      day = { date: entry.date, total: 0, bySubject: {} };
      perDay.push(day);
    }
    const points = entry.points ?? 0;
    day.total += points;
    day.bySubject[entry.subjectId] = (day.bySubject[entry.subjectId] ?? 0) + points;
  }

  return { row: rowFor(input.student.id, entries), entries, perDay };
}
