import type { DayLesson, DayResponse, MarkStatus } from "@shared/types.ts";

// Pure helpers for writing marks into a cached day (optimistic taps, server replies, pending queue).

export interface MarkPatch {
  lessonId: number;
  studentId: number;
  status: MarkStatus;
  updatedAt: number;
}

function patchLesson(lesson: DayLesson, patches: readonly MarkPatch[]): DayLesson {
  let marks: DayLesson["marks"] | null = null;
  for (const p of patches) {
    if (p.lessonId !== lesson.id) continue;
    const current = (marks ?? lesson.marks)[p.studentId];
    if (current?.status === p.status && current.updatedAt === p.updatedAt) continue;
    marks ??= { ...lesson.marks };
    marks[p.studentId] = { status: p.status, updatedAt: p.updatedAt };
  }
  return marks ? { ...lesson, marks } : lesson;
}

/** `day` with the given marks applied. Returns the same object when nothing changes. */
export function withMarks(day: DayResponse, patches: readonly MarkPatch[]): DayResponse {
  if (patches.length === 0) return day;
  const lessons = day.lessons.map((lesson) => patchLesson(lesson, patches));
  return lessons.some((lesson, i) => lesson !== day.lessons[i]) ? { ...day, lessons } : day;
}
