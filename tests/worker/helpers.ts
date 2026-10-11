import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect } from "vitest";

// Shared helpers for worker integration tests.
// Each test file gets its own D1 database, but tests inside a file share it: call
// `beforeEach(resetDb)` to give every test a fresh, empty (not yet set up) app.

export const SETUP_CODE = "dev-setup-code";
export const PASSWORD = "sprout-password";
export const PIN = "2468";
export const ORIGIN = "https://class.test";

export interface ApiInit {
  method?: string;
  /** Sent as JSON. A string is sent as-is. */
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Calls the worker. `path` is the full path, e.g. `/api/auth/status`.
 * Non-GET requests get `content-type: application/json` unless `headers` sets one.
 */
export function api(path: string, init: ApiInit = {}, cookie?: string): Promise<Response> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (cookie) headers.set("cookie", cookie);
  const body =
    init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body);
  const url = path.startsWith("http") ? path : `${ORIGIN}${path}`;
  return SELF.fetch(url, { method, headers, body });
}

/** The `cp_session=<token>` pair from a response's Set-Cookie, or null when none was set. */
export function sessionCookie(res: Response): string | null {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith("cp_session="));
  if (!raw) return null;
  const pair = raw.split(";")[0];
  return pair === "cp_session=" ? null : pair;
}

/** The raw Set-Cookie header for the session cookie (with its attributes). */
export function rawSessionCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith("cp_session="));
}

export const setupBody = (overrides: Record<string, unknown> = {}) => ({
  setupCode: SETUP_CODE,
  teacherName: "Ms Green",
  className: "Class 3B",
  password: PASSWORD,
  pin: PIN,
  schoolDays: [0, 1, 2, 3, 4],
  ...overrides,
});

/** Runs first-time setup and returns the session cookie it created. */
export async function setupTeacher(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await api("/api/auth/setup", { body: setupBody(overrides) });
  expect(res.status, await res.clone().text()).toBe(200);
  const cookie = sessionCookie(res);
  expect(cookie).not.toBeNull();
  return cookie!;
}

/** Logs in and returns the new session cookie. */
export async function login(password = PASSWORD): Promise<string> {
  const res = await api("/api/auth/login", { body: { password } });
  expect(res.status, await res.clone().text()).toBe(200);
  const cookie = sessionCookie(res);
  expect(cookie).not.toBeNull();
  return cookie!;
}

/** Unlocks admin for this session with the PIN. */
export async function unlock(cookie: string, pin = PIN): Promise<void> {
  const res = await api("/api/auth/unlock", { body: { pin } }, cookie);
  expect(res.status, await res.clone().text()).toBe(200);
}

/** Set up, logged in and admin-unlocked: the starting point for most admin route tests. */
export async function adminSession(): Promise<string> {
  const cookie = await setupTeacher();
  await unlock(cookie);
  return cookie;
}

const TABLES_IN_DELETE_ORDER = [
  "marks",
  "lessons",
  "students",
  "subjects",
  "holidays",
  "settings",
  "teacher",
  "sessions",
  "auth_attempts",
];

/** Empties every app table and restarts the id counters, so the next test starts before setup. */
export async function resetDb(): Promise<void> {
  await env.DB.batch([
    ...TABLES_IN_DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('subjects', 'students', 'holidays', 'lessons')"),
  ]);
}

/** Runs one SQL statement against the test database (for arranging state directly). */
export function sql(query: string, ...params: unknown[]) {
  return env.DB.prepare(query).bind(...params);
}
