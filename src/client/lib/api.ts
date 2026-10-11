import type { z } from "zod";
import type { ColorKey } from "@shared/palette.ts";
import type { resetSchema, setupSchema } from "@shared/schemas.ts";
import type {
  ApiErrorBody,
  AuthStatus,
  BackupFile,
  Bootstrap,
  CalendarResponse,
  DayLesson,
  DayResponse,
  ErrorCode,
  Holiday,
  ISODate,
  Mark,
  MarkStatus,
  ReportRaw,
  Settings,
  Student,
  Subject,
} from "@shared/types.ts";

// A thin typed client for the JSON API in spec §6. Every failure becomes an ApiError.

export type SetupBody = z.input<typeof setupSchema>;
export type ResetBody = z.input<typeof resetSchema>;
export type StudentPatch = Partial<Pick<Student, "name" | "avatar" | "color" | "activeFrom">>;
export type SubjectPatch = Partial<Pick<Subject, "name" | "emoji" | "color">>;

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  status: number;
  code: ErrorCode | "NETWORK";
  retryAfterMs?: number;

  constructor(status: number, code: ErrorCode | "NETWORK", message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "ADMIN_LOCKED",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

const NETWORK_MESSAGE = "Can't reach Class Points right now. Check the internet connection.";
const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function readErrorBody(res: Response): Promise<Partial<ApiErrorBody["error"]>> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody> | null;
    return body?.error ?? {};
  } catch {
    return {};
  }
}

function retryAfterHeaderMs(res: Response): number | undefined {
  const seconds = Number(res.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (method !== "GET") {
    // The worker's CSRF check needs the JSON content type on every non-GET request (spec §5).
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body ?? {});
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "NETWORK", NETWORK_MESSAGE);
  }

  if (!res.ok) {
    const error = await readErrorBody(res);
    const code = error.code ?? CODE_BY_STATUS[res.status] ?? "INTERNAL";
    throw new ApiError(
      res.status,
      code,
      error.message || FALLBACK_MESSAGE,
      error.retryAfterMs ?? retryAfterHeaderMs(res),
    );
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body);
const put = <T>(path: string, body?: unknown) => request<T>("PUT", path, body);
const patch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, body);
const del = <T>(path: string) => request<T>("DELETE", path);

/** Calls that resolve with nothing: whatever the server sends back is ignored. */
const done = async (p: Promise<unknown>): Promise<void> => {
  await p;
};

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const api = {
  // Auth
  authStatus: () => get<AuthStatus>("/auth/status"),
  setup: (b: SetupBody) => done(post("/auth/setup", b)),
  login: (password: string) => done(post("/auth/login", { password })),
  logout: () => done(post("/auth/logout")),
  reset: (b: ResetBody) => done(post("/auth/reset", b)),
  unlock: (pin: string) => done(post("/auth/unlock", { pin })),
  lock: () => done(post("/auth/lock")),
  changePassword: (currentPassword: string, newPassword: string) =>
    done(post("/auth/password", { currentPassword, newPassword })),
  changePin: (currentPin: string, newPin: string) => done(post("/auth/pin", { currentPin, newPin })),
  logoutAll: () => done(post("/auth/logout-all")),

  // Class data and settings
  bootstrap: () => get<Bootstrap>("/bootstrap"),
  patchSettings: (p: Partial<Settings>) => patch<Settings>("/settings", p),
  recalculate: () => post<{ updated: number }>("/settings/recalculate"),

  // Students
  createStudents: (names: string[], activeFrom: ISODate) => post<Student[]>("/students", { names, activeFrom }),
  patchStudent: (id: number, p: StudentPatch) => patch<Student>(`/students/${id}`, p),
  reorderStudents: (ids: number[]) => done(post("/students/reorder", { ids })),
  /** `date` is the device's local today; the student stops counting from that day. */
  archiveStudent: (id: number, date: ISODate) => post<Student>(`/students/${id}/archive`, { date }),
  restoreStudent: (id: number) => post<Student>(`/students/${id}/restore`),
  deleteStudent: (id: number) => done(del(`/students/${id}`)),

  // Subjects
  createSubject: (b: { name: string; emoji: string; color: ColorKey }) => post<Subject>("/subjects", b),
  patchSubject: (id: number, p: SubjectPatch) => patch<Subject>(`/subjects/${id}`, p),
  reorderSubjects: (ids: number[]) => done(post("/subjects/reorder", { ids })),
  archiveSubject: (id: number) => post<Subject>(`/subjects/${id}/archive`),
  restoreSubject: (id: number) => post<Subject>(`/subjects/${id}/restore`),
  deleteSubject: (id: number) => done(del(`/subjects/${id}`)),

  // Holidays
  createHoliday: (b: { startDate: ISODate; endDate: ISODate; label: string }) => post<Holiday>("/holidays", b),
  deleteHoliday: (id: number) => done(del(`/holidays/${id}`)),

  // Calendar, days, lessons and marks
  calendar: (month: string) => get<CalendarResponse>(`/calendar?${query({ month })}`),
  day: (date: ISODate) => get<DayResponse>(`/days/${date}`),
  createLesson: (date: ISODate, subjectId: number) => post<DayLesson>("/lessons", { date, subjectId }),
  deleteLesson: (id: number) => done(del(`/lessons/${id}`)),
  putMark: (lessonId: number, studentId: number, status: MarkStatus, clientTs: number) =>
    put<Mark>(`/lessons/${lessonId}/marks/${studentId}`, { status, clientTs }),

  // Reports and backup
  reportRaw: (from: ISODate, to: ISODate) => get<ReportRaw>(`/reports/raw?${query({ from, to })}`),
  backup: () => get<BackupFile>("/backup"),
};
