import { describe, expect, it } from "vitest";
import { buildClassReport, buildStudentReport, type StudentRow } from "@shared/report.ts";
import type { Lesson, Mark, MarkStatus, Student } from "@shared/types.ts";

function student(id: number, name: string, activeFrom: string, archivedAt: string | null = null): Student {
  return { id, name, avatar: "🦊", color: "leaf", sortOrder: id - 1, activeFrom, archivedAt };
}

const amy = student(1, "Amy", "2026-10-01");
const ben = student(2, "Ben", "2026-10-01");
const cat = student(3, "Cat", "2026-10-01", "2026-10-06"); // archived: not in the 10-06 lessons
const dan = student(4, "Dan", "2026-10-05"); // late joiner: not in the 10-04 lessons
// Deliberately out of order: rows must come back sorted by sortOrder.
const students = [dan, cat, amy, ben];

const lessons: Lesson[] = [
  { id: 1, date: "2026-10-04", subjectId: 1, pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 },
  { id: 2, date: "2026-10-04", subjectId: 2, pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 },
  { id: 3, date: "2026-10-06", subjectId: 1, pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 },
  { id: 4, date: "2026-10-06", subjectId: 2, pointsClean: 2, pointsWarning: 1, pointsPenalty: -1 },
];

function mark(lessonId: number, studentId: number, status: MarkStatus): Mark {
  return { lessonId, studentId, status, updatedAt: 1_760_000_000_000 };
}

const marks: Mark[] = [
  mark(1, amy.id, "warning"),
  mark(1, ben.id, "penalty"),
  mark(1, dan.id, "warning"), // Dan is not eligible on 10-04: ignored
  mark(2, ben.id, "absent"),
  mark(3, cat.id, "penalty"), // Cat is archived from 10-06: ignored
  mark(3, dan.id, "warning"),
  mark(4, amy.id, "penalty"),
];

function rowOf(rows: StudentRow[], studentId: number): StudentRow {
  const row = rows.find((r) => r.studentId === studentId);
  if (!row) throw new Error(`no row for student ${studentId}`);
  return row;
}

describe("report", () => {
  const report = buildClassReport({ lessons, marks, students });

  it("defaults to clean when no mark", () => {
    expect(rowOf(report.rows, cat.id)).toMatchObject({ points: 2, clean: 2, warnings: 0, penalties: 0, lessons: 2 });
    // Amy has no marks on lessons 2 and 3.
    expect(rowOf(report.rows, amy.id).clean).toBe(2);
  });

  it("report uses lesson snapshot values", () => {
    // Lesson 4 was started with a clean value of 2.
    expect(rowOf(report.rows, ben.id).bySubject[2].points).toBe(2);
    expect(rowOf(report.rows, dan.id).points).toBe(2);
    // Amy: clean in lesson 2 (+1) and a penalty in lesson 4 (−1).
    expect(rowOf(report.rows, amy.id).bySubject[2].points).toBe(0);
    expect(rowOf(report.rows, amy.id).points).toBe(1);
  });

  it("buildClassReport excludes ineligible", () => {
    const danRow = rowOf(report.rows, dan.id);
    expect(danRow).toMatchObject({ lessons: 2, warnings: 1, clean: 1 });

    const catRow = rowOf(report.rows, cat.id);
    expect(catRow).toMatchObject({ lessons: 2, penalties: 0, warnings: 0 });

    expect(report.lessonsHeld).toBe(4);
    expect(report.totals).toEqual({ points: 7, clean: 7, warnings: 4, penalties: 2, absences: 1, lessons: 12 });
  });

  it("absent excluded from points but counted", () => {
    const benRow = rowOf(report.rows, ben.id);
    // Penalty in lesson 1 (−1), absent in lesson 2, clean in lessons 3 (+1) and 4 (+2).
    expect(benRow).toMatchObject({ points: 2, absences: 1, lessons: 4, attended: 3 });
    expect(benRow.bySubject[2]).toEqual({ points: 2, clean: 1, warnings: 0, penalties: 0, absences: 1, lessons: 2 });
  });

  it("warnings include penalties", () => {
    expect(rowOf(report.rows, amy.id)).toMatchObject({ warnings: 2, penalties: 1 });
    expect(rowOf(report.rows, ben.id)).toMatchObject({ warnings: 1, penalties: 1 });
    expect(rowOf(report.rows, amy.id).bySubject[2]).toMatchObject({ warnings: 1, penalties: 1 });
  });

  it("subject filter", () => {
    const filtered = buildClassReport({ lessons, marks, students, subjectIds: [2] });
    expect(filtered.lessonsHeld).toBe(2);
    expect(filtered.rows.map((r) => r.studentId)).toEqual([1, 2, 3, 4]);
    for (const row of filtered.rows) expect(Object.keys(row.bySubject)).toEqual(["2"]);
    expect(rowOf(filtered.rows, amy.id)).toMatchObject({ points: 0, lessons: 2, warnings: 1, penalties: 1 });
    expect(rowOf(filtered.rows, ben.id)).toMatchObject({ points: 2, lessons: 2, absences: 1 });
    // Amy 0, Ben 2, Cat 1 (lesson 2 only), Dan 2 (lesson 4 only).
    expect(filtered.totals).toEqual({ points: 5, clean: 4, warnings: 1, penalties: 1, absences: 1, lessons: 6 });

    const none = buildClassReport({ lessons, marks, students, subjectIds: [] });
    expect(none).toEqual({
      lessonsHeld: 0,
      rows: [],
      totals: { points: 0, clean: 0, warnings: 0, penalties: 0, absences: 0, lessons: 0 },
      podium: [],
    });
  });

  it("podium dense ranking with ties", () => {
    // Amy 5, Ben 5, Dan 2 (absent once), Cat 1.
    const tied = buildClassReport({
      lessons,
      students,
      marks: [mark(1, cat.id, "warning"), mark(3, dan.id, "absent")],
    });
    expect(tied.podium).toEqual([
      { place: 1, points: 5, studentIds: [1, 2] },
      { place: 2, points: 2, studentIds: [4] },
      { place: 3, points: 1, studentIds: [3] },
    ]);

    // Places stop at 3. Ben 5, Amy 4, Dan 2, Cat 1.
    const spread = buildClassReport({
      lessons,
      students,
      marks: [mark(1, cat.id, "warning"), mark(3, dan.id, "absent"), mark(4, amy.id, "warning")],
    });
    expect(spread.podium).toEqual([
      { place: 1, points: 5, studentIds: [2] },
      { place: 2, points: 4, studentIds: [1] },
      { place: 3, points: 2, studentIds: [4] },
    ]);

    // A student who missed every lesson (attended 0) is left off the podium.
    const allAbsent = buildClassReport({
      lessons,
      students,
      marks: [mark(1, cat.id, "warning"), mark(3, dan.id, "absent"), mark(4, dan.id, "absent")],
    });
    expect(rowOf(allAbsent.rows, dan.id)).toMatchObject({ points: 0, attended: 0, lessons: 2 });
    expect(allAbsent.podium).toEqual([
      { place: 1, points: 5, studentIds: [1, 2] },
      { place: 2, points: 1, studentIds: [3] },
    ]);
  });

  it("rows only for students with lessons", () => {
    expect(report.rows.map((r) => r.studentId)).toEqual([1, 2, 3, 4]);

    const eve = { ...student(5, "Eve", "2026-10-20"), sortOrder: -1 };
    const firstDay = buildClassReport({ lessons: lessons.slice(0, 2), marks, students: [...students, eve] });
    expect(firstDay.rows.map((r) => r.studentId)).toEqual([1, 2, 3]);
    expect(firstDay.lessonsHeld).toBe(2);
  });

  it("buildStudentReport perDay sums by subject", () => {
    const amyReport = buildStudentReport({ lessons, marks, student: amy });
    expect(amyReport.row).toEqual(rowOf(report.rows, amy.id));
    expect(amyReport.perDay).toEqual([
      { date: "2026-10-04", total: 1, bySubject: { 1: 0, 2: 1 } },
      { date: "2026-10-06", total: 0, bySubject: { 1: 1, 2: -1 } },
    ]);
    expect(amyReport.entries).toEqual([
      { date: "2026-10-04", lessonId: 1, subjectId: 1, status: "warning", points: 0 },
      { date: "2026-10-04", lessonId: 2, subjectId: 2, status: "clean", points: 1 },
      { date: "2026-10-06", lessonId: 3, subjectId: 1, status: "clean", points: 1 },
      { date: "2026-10-06", lessonId: 4, subjectId: 2, status: "penalty", points: -1 },
    ]);

    // Absent adds nothing to the day; ineligible lessons are skipped.
    const benReport = buildStudentReport({ lessons, marks, student: ben, subjectIds: [2] });
    expect(benReport.perDay).toEqual([
      { date: "2026-10-04", total: 0, bySubject: { 2: 0 } },
      { date: "2026-10-06", total: 2, bySubject: { 2: 2 } },
    ]);
    expect(benReport.entries[0]).toMatchObject({ lessonId: 2, status: "absent", points: null });

    const danReport = buildStudentReport({ lessons, marks, student: dan });
    expect(danReport.entries.map((e) => e.lessonId)).toEqual([3, 4]);

    const nobody = buildStudentReport({ lessons, marks, student: student(9, "Zed", "2026-11-01") });
    expect(nobody).toEqual({ row: null, entries: [], perDay: [] });
  });
});
