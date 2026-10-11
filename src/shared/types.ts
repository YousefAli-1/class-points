import type { ColorKey } from "./palette.ts";

/** A calendar date as `YYYY-MM-DD`. */
export type ISODate = string;

/** One status per (lesson, student). `clean` is the default when no mark row exists. */
export type MarkStatus = "clean" | "warning" | "penalty" | "absent";

export interface PointValues {
  pointsClean: number;
  pointsWarning: number;
  pointsPenalty: number;
}

export interface Settings extends PointValues {
  teacherName: string;
  className: string;
  /** Weekday numbers, 0 = Sunday … 6 = Saturday. */
  schoolDays: number[];
  soundOn: boolean;
  reportsNeedPin: boolean;
  /** Epoch ms. */
  lastBackupAt: number | null;
}

export interface Subject {
  id: number;
  name: string;
  emoji: string;
  color: ColorKey;
  sortOrder: number;
  /** Epoch ms. */
  archivedAt: number | null;
}

export interface Student {
  id: number;
  name: string;
  avatar: string;
  color: ColorKey;
  sortOrder: number;
  activeFrom: ISODate;
  archivedAt: ISODate | null;
}

export interface Holiday {
  id: number;
  startDate: ISODate;
  endDate: ISODate;
  label: string;
}

/** A started lesson. Its point values are a snapshot taken when it was started. */
export interface Lesson extends PointValues {
  id: number;
  date: ISODate;
  subjectId: number;
}

export interface Mark {
  lessonId: number;
  studentId: number;
  status: MarkStatus;
  /** Epoch ms. */
  updatedAt: number;
}

export interface DayLesson extends Lesson {
  /** Keyed by student id. */
  marks: Record<number, { status: MarkStatus; updatedAt: number }>;
}

export interface DayResponse {
  date: ISODate;
  lessons: DayLesson[];
}

export interface CalendarResponse {
  lessons: { id: number; date: ISODate; subjectId: number }[];
}

export interface Bootstrap {
  settings: Settings;
  subjects: Subject[];
  students: Student[];
  holidays: Holiday[];
}

export interface AuthStatus {
  setupDone: boolean;
  loggedIn: boolean;
  adminUnlocked: boolean;
  adminUntil: number | null;
}

export interface ReportRaw {
  lessons: Lesson[];
  marks: Mark[];
}

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "ADMIN_LOCKED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SETUP_DISABLED"
  | "INTERNAL";

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; retryAfterMs?: number };
}

export interface BackupFile {
  version: 1;
  exportedAt: number;
  settings: Settings;
  subjects: Subject[];
  students: Student[];
  holidays: Holiday[];
  lessons: Lesson[];
  marks: Mark[];
}
