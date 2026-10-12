import { format } from "date-fns";
import { parseISODate } from "@shared/dates.ts";
import type { StudentEntry } from "@shared/report.ts";
import type { Subject } from "@shared/types.ts";

/** Subjects in their admin order. */
export function sortSubjects(list: readonly Subject[]): Subject[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
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
