import { format } from "date-fns";
import { parseISODate } from "@shared/dates.ts";
import type { StudentEntry } from "@shared/report.ts";
import type { Lesson, Subject } from "@shared/types.ts";

/** Subjects in their admin order. */
export function sortSubjects(list: readonly Subject[]): Subject[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/**
 * The subjects with a lesson in the period (`taught`), and the filter chips: current subjects plus
 * removed ones that still have lessons in the period, in admin order.
 */
export function periodSubjects(
  subjects: readonly Subject[],
  lessons: readonly Pick<Lesson, "subjectId">[] | undefined,
): { taught: Set<number>; chipSubjects: Subject[] } {
  const taught = new Set(lessons?.map((l) => l.subjectId));
  return { taught, chipSubjects: sortSubjects(subjects.filter((s) => s.archivedAt === null || taught.has(s.id))) };
}

const MARK_LABEL: Record<StudentEntry["status"], string> = {
  clean: "⭐ No cards",
  warning: "🟥 Warning",
  penalty: "🟥🟥 Penalty",
  absent: "🏠 Absent",
};

/** "Mon 12 Oct", the subject and "🟥 Warning" for one line of a student's report. */
export function entryParts(entry: StudentEntry, subject: Subject | undefined): [day: string, subject: string, mark: string] {
  return [format(parseISODate(entry.date), "EEE d MMM"), subject?.name ?? "Removed subject", MARK_LABEL[entry.status]];
}
