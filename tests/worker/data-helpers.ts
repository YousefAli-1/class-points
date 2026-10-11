import { expect } from "vitest";
import type {
  ApiErrorBody,
  Bootstrap,
  DayLesson,
  DayResponse,
  Lesson,
  MarkStatus,
  Student,
} from "@shared/types.ts";
import { api, sql } from "./helpers.ts";

// Helpers for the data route tests (Task 4). Auth helpers live in helpers.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

/** A school day safely in the past, so a lesson on it is always allowed. */
export const PAST = "2025-03-10";

/** Students created by `addStudents` count from this date unless told otherwise. */
export const ACTIVE_FROM = "2025-01-01";

/** The UTC calendar date `offsetDays` from now: what the server compares "future" dates against. */
export function utcDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** Awaits the response, asserts its status (showing the body on failure) and returns its JSON. */
export async function expectJson<T>(response: Response | Promise<Response>, status = 200): Promise<T> {
  const res = await response;
  expect(res.status, await res.clone().text()).toBe(status);
  return res.json<T>();
}

/** Asserts an error response and returns its `{ code, message }`. */
export async function expectError(response: Response | Promise<Response>, status: number) {
  const body = await expectJson<ApiErrorBody>(response, status);
  return body.error;
}

/** A POST with no body (archive, restore, recalculate, lock). */
export const post = (path: string, cookie?: string) => api(path, { method: "POST" }, cookie);

export const del = (path: string, cookie?: string) => api(path, { method: "DELETE" }, cookie);

export const patch = (path: string, body: unknown, cookie?: string) => api(path, { method: "PATCH", body }, cookie);

export const getBootstrap = (cookie: string) => expectJson<Bootstrap>(api("/api/bootstrap", {}, cookie));

export const getDay = (cookie: string, date: string) => expectJson<DayResponse>(api(`/api/days/${date}`, {}, cookie));

export const addStudents = (cookie: string, names: string[], activeFrom = ACTIVE_FROM) =>
  expectJson<Student[]>(api("/api/students", { body: { names, activeFrom } }, cookie), 201);

/** Starts a new lesson (asserting it was created, not found). */
export const startLesson = (cookie: string, date: string, subjectId = 1) =>
  expectJson<DayLesson>(api("/api/lessons", { body: { date, subjectId } }, cookie), 201);

export const putMark = (cookie: string, lessonId: number, studentId: number, status: MarkStatus, clientTs: number) =>
  api(`/api/lessons/${lessonId}/marks/${studentId}`, { method: "PUT", body: { status, clientTs } }, cookie);

/** The lesson fields of a DayLesson, as reports and backups list them. */
export function lessonOf(day: DayLesson): Lesson {
  const { id, date, subjectId, pointsClean, pointsWarning, pointsPenalty } = day;
  return { id, date, subjectId, pointsClean, pointsWarning, pointsPenalty };
}

/** The number of rows in `table`. */
export async function count(table: string): Promise<number | null> {
  return sql(`SELECT count(*) AS n FROM ${table}`).first<number>("n");
}
