import { env } from "cloudflare:workers";
import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEFAULT_SUBJECTS } from "@shared/palette.ts";
import { DEFAULT_POINTS } from "@shared/rules.ts";
import type { AuthStatus } from "@shared/types.ts";
import { app } from "@worker/app.ts";
import { getDb } from "@worker/db/client.ts";
import { hashSecret, sha256Hex, verifySecret } from "@worker/lib/crypto.ts";
import {
  AppError,
  adminLocked,
  badRequest,
  conflict,
  notFound,
  rateLimited,
  unauthorized,
} from "@worker/lib/errors.ts";
import { addressBucket, forgetAttempts, reserveAttempt } from "@worker/lib/rateLimit.ts";
import { parseJson, parseQuery } from "@worker/lib/validate.ts";
import {
  api,
  login,
  ORIGIN,
  PASSWORD,
  PIN,
  rawSessionCookie,
  resetDb,
  sessionCookie,
  SETUP_CODE,
  setupBody,
  setupTeacher,
  sql,
  unlock,
} from "./helpers.ts";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

beforeEach(resetDb);

async function status(cookie?: string): Promise<AuthStatus> {
  const res = await api("/api/auth/status", {}, cookie);
  expect(res.status).toBe(200);
  return res.json();
}

/** POST /api/auth/password, the admin probe used throughout. */
function changePassword(cookie: string, currentPassword = PASSWORD, newPassword = "new-password-1") {
  return api("/api/auth/password", { body: { currentPassword, newPassword } }, cookie);
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string; retryAfterMs?: number } }).error;
}

describe("auth status", () => {
  it("status before setup", async () => {
    expect(await status()).toEqual({ setupDone: false, loggedIn: false, adminUnlocked: false, adminUntil: null });
  });

  it("shows set up but logged out without a cookie", async () => {
    await setupTeacher();
    expect(await status()).toMatchObject({ setupDone: true, loggedIn: false });
  });
});

describe("setup", () => {
  it("setup rejects wrong code", async () => {
    const res = await api("/api/auth/setup", { body: setupBody({ setupCode: "nope" }) });

    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("UNAUTHORIZED");
    expect(sessionCookie(res)).toBeNull();
    expect(await status()).toMatchObject({ setupDone: false });
  });

  it("setup creates teacher, settings, 3 subjects and logs in", async () => {
    const res = await api("/api/auth/setup", { body: setupBody({ schoolDays: [4, 0, 1, 2, 3, 0] }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ setupDone: true, loggedIn: true, adminUnlocked: false });
    const cookie = sessionCookie(res);
    expect(cookie).not.toBeNull();
    expect(await status(cookie!)).toMatchObject({ setupDone: true, loggedIn: true });

    const t = await sql("SELECT * FROM teacher").first<Record<string, unknown>>();
    expect(t).toMatchObject({ id: 1, name: "Ms Green" });
    expect(t!.password_hash).toMatch(/^pbkdf2\$100000\$/);
    expect(t!.password_hash).not.toContain(PASSWORD);
    expect(await verifySecret(PASSWORD, t!.password_hash as string)).toBe(true);
    expect(await verifySecret(PIN, t!.pin_hash as string)).toBe(true);

    const s = await sql("SELECT * FROM settings").first<Record<string, unknown>>();
    expect(s).toMatchObject({
      id: 1,
      class_name: "Class 3B",
      points_clean: DEFAULT_POINTS.pointsClean,
      points_warning: DEFAULT_POINTS.pointsWarning,
      points_penalty: DEFAULT_POINTS.pointsPenalty,
      sound_on: 1,
      reports_need_pin: 0,
      last_backup_at: null,
    });
    expect(JSON.parse(s!.school_days as string)).toEqual([0, 1, 2, 3, 4]);

    const { results: subjects } = await sql("SELECT * FROM subjects ORDER BY sort_order").all();
    expect(subjects.map((r) => ({ name: r.name, emoji: r.emoji, color: r.color, archived_at: r.archived_at }))).toEqual(
      DEFAULT_SUBJECTS.map((d) => ({ ...d, archived_at: null })),
    );
    expect(new Set(subjects.map((r) => r.sort_order)).size).toBe(3);
  });

  it("setup twice", async () => {
    await setupTeacher();
    const res = await api("/api/auth/setup", { body: setupBody({ teacherName: "Someone Else" }) });

    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("CONFLICT");
    expect(await sql("SELECT count(*) AS n FROM subjects").first("n")).toBe(3);
    expect(await sql("SELECT name FROM teacher").first("name")).toBe("Ms Green");
  });

  it("rejects an invalid payload with the first issue message", async () => {
    const res = await api("/api/auth/setup", { body: setupBody({ password: "short" }) });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({ code: "BAD_REQUEST", message: "Use at least 8 characters." });
  });

  it("rejects a body that is not JSON", async () => {
    const res = await api("/api/auth/setup", { body: "{not json" });

    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("BAD_REQUEST");
  });

  it("is disabled when SETUP_CODE is unset", async () => {
    const res = await app.request(
      `${ORIGIN}/api/auth/setup`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(setupBody()) },
      { ...env, SETUP_CODE: undefined },
    );

    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe("SETUP_DISABLED");
    expect(await status()).toMatchObject({ setupDone: false });
  });

  it("locks the setup code after 5 wrong tries", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await api("/api/auth/setup", { body: setupBody({ setupCode: "nope" }) })).status).toBe(401);
    }
    const res = await api("/api/auth/setup", { body: setupBody() });

    expect(res.status).toBe(429);
    expect(await status()).toMatchObject({ setupDone: false });
  });
});

describe("login and logout", () => {
  beforeEach(async () => {
    await setupTeacher();
  });

  it("login wrong password 5x locks", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await api("/api/auth/login", { body: { password: "wrong-password" } });
      expect(res.status).toBe(401);
      expect((await errorOf(res)).code).toBe("UNAUTHORIZED");
    }
    const res = await api("/api/auth/login", { body: { password: PASSWORD } });

    expect(res.status).toBe(429);
    const error = await errorOf(res);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterMs).toBeGreaterThan(4 * MINUTE);
    expect(error.retryAfterMs).toBeLessThanOrEqual(5 * MINUTE);
    expect(sessionCookie(res)).toBeNull();
  });

  it("counts failures per IP", async () => {
    const fromIp = (ip: string, password: string) =>
      api("/api/auth/login", { body: { password }, headers: { "cf-connecting-ip": ip } });
    for (let i = 0; i < 5; i++) await fromIp("203.0.113.1", "wrong-password");

    expect((await fromIp("203.0.113.1", PASSWORD)).status).toBe(429);
    expect((await fromIp("203.0.113.2", PASSWORD)).status).toBe(200);
  });

  it("counts IPv6 failures per /64, so a new address in the same network is still locked", async () => {
    const fromIp = (ip: string, password: string) =>
      api("/api/auth/login", { body: { password }, headers: { "cf-connecting-ip": ip } });
    // One host can use any of the 2^64 addresses in its /64.
    for (let i = 1; i <= 5; i++) expect((await fromIp(`2001:db8:1:2::${i}`, "wrong-password")).status).toBe(401);

    expect((await fromIp("2001:db8:1:2:ffff:ffff:ffff:ffff", PASSWORD)).status).toBe(429);
    expect((await fromIp("2001:0DB8:0001:0002:0:0:0:99", PASSWORD)).status).toBe(429);
    expect((await fromIp("2001:db8:1:3::1", PASSWORD)).status).toBe(200);
  });

  it("a burst of parallel wrong logins gets no more than 5 guesses", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => api("/api/auth/login", { body: { password: "wrong-password" } })),
    );
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
    expect((await api("/api/auth/login", { body: { password: PASSWORD } })).status).toBe(429);
  });

  it("a burst of parallel wrong PINs gets no more than 5 guesses", async () => {
    const cookie = await login();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => api("/api/auth/unlock", { body: { pin: "9999" } }, cookie)),
    );

    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
  });

  it("a successful login resets the failure count", async () => {
    for (let i = 0; i < 4; i++) await api("/api/auth/login", { body: { password: "wrong-password" } });
    await login();
    for (let i = 0; i < 4; i++) await api("/api/auth/login", { body: { password: "wrong-password" } });

    expect((await api("/api/auth/login", { body: { password: PASSWORD } })).status).toBe(200);
  });

  it("login ok sets HttpOnly SameSite=Lax cookie", async () => {
    const res = await api("/api/auth/login", { body: { password: PASSWORD } });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ setupDone: true, loggedIn: true, adminUnlocked: false });
    const raw = rawSessionCookie(res)!;
    expect(raw).toMatch(/^cp_session=[A-Za-z0-9_-]{43};/);
    expect(raw).toMatch(/; HttpOnly/i);
    expect(raw).toMatch(/; SameSite=Lax/i);
    expect(raw).toMatch(/; Path=\//i);
    expect(raw).toMatch(/; Max-Age=5184000/i);
    expect(raw).toMatch(/; Secure/i);
  });

  it("does not mark the cookie Secure over plain http", async () => {
    const res = await api("http://class.test/api/auth/login", { body: { password: PASSWORD } });

    expect(res.status).toBe(200);
    expect(rawSessionCookie(res)).not.toMatch(/Secure/i);
  });

  it("stores only a hash of the session token", async () => {
    const cookie = await login();
    const token = cookie.slice("cp_session=".length);
    const { results } = await sql("SELECT id_hash FROM sessions").all<{ id_hash: string }>();

    expect(results.map((r) => r.id_hash)).toContain(await sha256Hex(token));
    expect(results.map((r) => r.id_hash)).not.toContain(token);
  });

  it("logout clears session", async () => {
    const cookie = await login();
    const res = await api("/api/auth/logout", { method: "POST" }, cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ loggedIn: false });
    expect(rawSessionCookie(res)).toMatch(/Max-Age=0/i);
    expect(await status(cookie)).toMatchObject({ loggedIn: false });
  });

  it("ignores and clears an unknown session cookie", async () => {
    const res = await api("/api/auth/status", {}, "cp_session=not-a-real-token");

    expect(await res.json()).toMatchObject({ setupDone: true, loggedIn: false });
    expect(rawSessionCookie(res)).toMatch(/^cp_session=;.*Max-Age=0/i);
  });

  it("answers a login with a stale cookie with just the new cookie", async () => {
    const res = await api("/api/auth/login", { body: { password: PASSWORD } }, "cp_session=stale-token");

    expect(res.headers.getSetCookie()).toHaveLength(1);
    expect(await status(sessionCookie(res)!)).toMatchObject({ loggedIn: true });
  });

  it("treats an expired session as logged out", async () => {
    const cookie = await login();
    await sql("UPDATE sessions SET expires_at = ?", Date.now() - 1).run();

    expect(await status(cookie)).toMatchObject({ loggedIn: false });
  });

  it("slides the session when less than 30 days remain", async () => {
    const cookie = await login();
    await sql("UPDATE sessions SET expires_at = ?", Date.now() + 10 * DAY).run();
    const res = await api("/api/auth/status", {}, cookie);

    expect(await res.json()).toMatchObject({ loggedIn: true });
    expect(rawSessionCookie(res)).toMatch(/Max-Age=5184000/i);
    const idHash = await sha256Hex(cookie.slice("cp_session=".length));
    const expiresAt = await sql("SELECT expires_at FROM sessions WHERE id_hash = ?", idHash).first<number>("expires_at");
    expect(expiresAt).toBeGreaterThan(Date.now() + 59 * DAY);
  });

  it("does not touch a fresh session", async () => {
    const cookie = await login();
    const res = await api("/api/auth/status", {}, cookie);

    expect(rawSessionCookie(res)).toBeUndefined();
  });
});

describe("admin unlock", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await setupTeacher();
  });

  it("unlock needs a session", async () => {
    const res = await api("/api/auth/unlock", { body: { pin: PIN } });

    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("UNAUTHORIZED");
  });

  it("unlock with wrong pin", async () => {
    const res = await api("/api/auth/unlock", { body: { pin: "9999" } }, cookie);

    expect(res.status).toBe(401);
    expect(await status(cookie)).toMatchObject({ adminUnlocked: false });
  });

  it("unlock ok", async () => {
    const before = Date.now();
    const res = await api("/api/auth/unlock", { body: { pin: PIN } }, cookie);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthStatus;
    expect(body).toMatchObject({ loggedIn: true, adminUnlocked: true });
    expect(body.adminUntil).toBeGreaterThanOrEqual(before + 10 * MINUTE);
    expect(body.adminUntil).toBeLessThanOrEqual(Date.now() + 10 * MINUTE);
    expect(await status(cookie)).toMatchObject({ adminUnlocked: true });
  });

  it("locks the PIN after 5 wrong tries", async () => {
    for (let i = 0; i < 5; i++) await api("/api/auth/unlock", { body: { pin: "9999" } }, cookie);
    const res = await api("/api/auth/unlock", { body: { pin: PIN } }, cookie);

    expect(res.status).toBe(429);
    expect(await status(cookie)).toMatchObject({ adminUnlocked: false });
  });

  it("admin routes need the PIN", async () => {
    const res = await changePassword(cookie);

    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("ADMIN_LOCKED");
  });

  it("admin expires", async () => {
    await unlock(cookie);
    await sql("UPDATE sessions SET admin_until = ?", Date.now() - 1000).run();
    const res = await changePassword(cookie);

    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("ADMIN_LOCKED");
    expect(await status(cookie)).toMatchObject({ adminUnlocked: false, adminUntil: null });
  });

  it("admin activity slides the unlock forward", async () => {
    await unlock(cookie);
    await sql("UPDATE sessions SET admin_until = ?", Date.now() + MINUTE).run();
    const res = await changePassword(cookie);

    expect(res.status).toBe(200);
    const adminUntil = await sql("SELECT admin_until FROM sessions").first<number>("admin_until");
    expect(adminUntil).toBeGreaterThan(Date.now() + 9 * MINUTE);
  });

  it("lock clears the unlock", async () => {
    await unlock(cookie);
    const res = await api("/api/auth/lock", { method: "POST" }, cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ loggedIn: true, adminUnlocked: false, adminUntil: null });
    const probe = await changePassword(cookie);
    expect(probe.status).toBe(403);
  });

  it("an unlock belongs to one session only", async () => {
    await unlock(cookie);
    const other = await login();

    expect(await status(other)).toMatchObject({ loggedIn: true, adminUnlocked: false });
  });
});

describe("password, PIN and sessions", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = await setupTeacher();
    await unlock(cookie);
  });

  it("change password requires current", async () => {
    const wrong = await changePassword(cookie, "not-it-at-all");
    expect(wrong.status).toBe(400);
    expect((await errorOf(wrong)).code).toBe("BAD_REQUEST");
    expect((await api("/api/auth/login", { body: { password: "new-password-1" } })).status).toBe(401);

    const ok = await changePassword(cookie);
    expect(ok.status).toBe(200);
    expect((await api("/api/auth/login", { body: { password: PASSWORD } })).status).toBe(401);
    await login("new-password-1");
    expect(await status(cookie)).toMatchObject({ loggedIn: true });
  });

  it("change PIN requires current", async () => {
    const wrong = await api("/api/auth/pin", { body: { currentPin: "0000", newPin: "13579" } }, cookie);
    expect(wrong.status).toBe(400);

    const ok = await api("/api/auth/pin", { body: { currentPin: PIN, newPin: "13579" } }, cookie);
    expect(ok.status).toBe(200);
    expect((await api("/api/auth/unlock", { body: { pin: PIN } }, cookie)).status).toBe(401);
    await unlock(cookie, "13579");
  });

  it("validates the new password", async () => {
    const res = await changePassword(cookie, PASSWORD, "short");

    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toBe("Use at least 8 characters.");
  });

  it("logout-all ends every session", async () => {
    const other = await login();
    const res = await api("/api/auth/logout-all", { method: "POST" }, cookie);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ loggedIn: false });
    expect(await status(cookie)).toMatchObject({ loggedIn: false });
    expect(await status(other)).toMatchObject({ loggedIn: false });
    expect(await sql("SELECT count(*) AS n FROM sessions").first("n")).toBe(0);
  });
});

describe("reset", () => {
  it("reset with setup code replaces password and pin and kills sessions", async () => {
    const first = await setupTeacher();
    const second = await login();
    const res = await api("/api/auth/reset", {
      body: { setupCode: SETUP_CODE, newPassword: "brand-new-pass", newPin: "8642" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ setupDone: true, loggedIn: true, adminUnlocked: false });
    const fresh = sessionCookie(res)!;
    expect(await status(first)).toMatchObject({ loggedIn: false });
    expect(await status(second)).toMatchObject({ loggedIn: false });
    expect(await status(fresh)).toMatchObject({ loggedIn: true });

    expect((await api("/api/auth/login", { body: { password: PASSWORD } })).status).toBe(401);
    const cookie = await login("brand-new-pass");
    expect((await api("/api/auth/unlock", { body: { pin: PIN } }, cookie)).status).toBe(401);
    await unlock(cookie, "8642");
  });

  it("lifts the login lock she ran into, for her whole IPv6 /64", async () => {
    await setupTeacher();
    const from = (ip: string) => ({ "cf-connecting-ip": ip });
    for (let i = 0; i < 5; i++) {
      await api("/api/auth/login", { body: { password: "wrong-password" }, headers: from("2001:db8:7:7::1") });
    }
    const res = await api("/api/auth/reset", {
      body: { setupCode: SETUP_CODE, newPassword: "brand-new-pass", newPin: "8642" },
      headers: from("2001:db8:7:7::2"),
    });

    expect(res.status).toBe(200);
    const again = await api("/api/auth/login", { body: { password: "brand-new-pass" }, headers: from("2001:db8:7:7::3") });
    expect(again.status).toBe(200);
  });

  it("rejects a wrong setup code and keeps the password", async () => {
    await setupTeacher();
    const res = await api("/api/auth/reset", {
      body: { setupCode: "nope", newPassword: "brand-new-pass", newPin: "8642" },
    });

    expect(res.status).toBe(401);
    await login(PASSWORD);
  });

  it("needs setup first", async () => {
    const res = await api("/api/auth/reset", {
      body: { setupCode: SETUP_CODE, newPassword: "brand-new-pass", newPin: "8642" },
    });

    expect(res.status).toBe(409);
  });
});

describe("csrf and headers", () => {
  it("csrf: POST without json content-type", async () => {
    await setupTeacher();
    const res = await api("/api/auth/login", {
      body: JSON.stringify({ password: PASSWORD }),
      headers: { "content-type": "text/plain" },
    });

    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe("BAD_REQUEST");
    expect(sessionCookie(res)).toBeNull();
  });

  it("csrf: foreign Origin", async () => {
    await setupTeacher();
    const res = await api("/api/auth/login", {
      body: { password: PASSWORD },
      headers: { origin: "https://evil.test" },
    });

    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("BAD_REQUEST");
    expect(sessionCookie(res)).toBeNull();
  });

  it("accepts a same-origin Origin and a charset on the content type", async () => {
    await setupTeacher();
    const res = await api("/api/auth/login", {
      body: { password: PASSWORD },
      headers: { origin: ORIGIN, "content-type": "application/json; charset=utf-8" },
    });

    expect(res.status).toBe(200);
  });

  it("sets security headers on API responses", async () => {
    const res = await api("/api/auth/status");

    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the security headers on error responses", async () => {
    const res = await api("/api/auth/login", { body: "{}", headers: { "content-type": "text/plain" } });

    expect(res.status).toBe(415);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers unknown API paths with a JSON 404", async () => {
    const res = await api("/api/nope");

    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("NOT_FOUND");
  });

  it("reports an unexpected failure as INTERNAL without its details", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const brokenDb = {
      prepare() {
        throw new Error("database is down");
      },
    } as unknown as D1Database;
    try {
      const res = await app.request(`${ORIGIN}/api/auth/status`, {}, { ...env, DB: brokenDb });

      expect(res.status).toBe(500);
      expect(await errorOf(res)).toEqual({ code: "INTERNAL", message: "Something went wrong. Please try again." });
      expect(logged).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });
});

describe("errors and validation", () => {
  it("maps each error helper to its status and code", () => {
    const cases: [AppError, number, string][] = [
      [badRequest("Nope."), 400, "BAD_REQUEST"],
      [unauthorized(), 401, "UNAUTHORIZED"],
      [adminLocked(), 403, "ADMIN_LOCKED"],
      [notFound(), 404, "NOT_FOUND"],
      [conflict("Taken."), 409, "CONFLICT"],
      [rateLimited(1500), 429, "RATE_LIMITED"],
    ];
    for (const [error, status, code] of cases) {
      expect(error).toBeInstanceOf(AppError);
      expect({ status: error.status, code: error.code }).toEqual({ status, code });
    }
    expect(rateLimited(1500).retryAfterMs).toBe(1500);
    expect(notFound("Student").message).toBe("Student wasn't found.");
  });

  const monthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month.") });
  const withQuery = (query: Record<string, string>) => ({ req: { query: () => query } }) as unknown as Context;
  const withBody = (body: string) => ({ req: { json: async () => JSON.parse(body) } }) as unknown as Context;

  it("parseQuery returns the parsed query or throws the first issue as BAD_REQUEST", () => {
    expect(parseQuery(withQuery({ month: "2026-10" }), monthQuery)).toEqual({ month: "2026-10" });
    expect(() => parseQuery(withQuery({ month: "2026-13" }), monthQuery)).toThrow(
      expect.objectContaining({ status: 400, code: "BAD_REQUEST", message: "Pick a month." }),
    );
  });

  it("parseJson returns the parsed body or throws BAD_REQUEST", async () => {
    expect(await parseJson(withBody('{"month":"2026-10"}'), monthQuery)).toEqual({ month: "2026-10" });
    await expect(parseJson(withBody('{"month":"10/2026"}'), monthQuery)).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
      message: "Pick a month.",
    });
    await expect(parseJson(withBody("{not json"), monthQuery)).rejects.toMatchObject({ status: 400 });
  });
});

describe("database constraints", () => {
  const insertSubject = () =>
    sql("INSERT INTO subjects (name, emoji, color, sort_order) VALUES ('Art', '🎨', 'coral', 0)").run();
  const insertLesson = (subjectId: number) =>
    sql(
      "INSERT INTO lessons (date, subject_id, points_clean, points_warning, points_penalty, created_at) VALUES ('2026-10-05', ?, 1, 0, -1, 0)",
      subjectId,
    ).run();
  const insertStudent = () =>
    sql(
      "INSERT INTO students (name, avatar, color, sort_order, active_from, created_at) VALUES ('Ali', '🦊', 'sky', 0, '2026-09-01', 0)",
    ).run();

  it("allows only one teacher row and one settings row", async () => {
    await expect(
      sql("INSERT INTO teacher (id, name, password_hash, pin_hash, created_at) VALUES (2, 'X', 'h', 'h', 0)").run(),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      sql(
        "INSERT INTO settings (id, class_name, points_clean, points_warning, points_penalty, school_days, sound_on, reports_need_pin) VALUES (2, 'C', 1, 0, -1, '[1]', 1, 0)",
      ).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("keeps one lesson per date and subject", async () => {
    const subjectId = (await insertSubject()).meta.last_row_id;
    await insertLesson(subjectId);

    await expect(insertLesson(subjectId)).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("accepts only the four mark statuses and cascades deletes to marks", async () => {
    const subjectId = (await insertSubject()).meta.last_row_id;
    const lessonId = (await insertLesson(subjectId)).meta.last_row_id;
    const first = (await insertStudent()).meta.last_row_id;
    const second = (await insertStudent()).meta.last_row_id;
    const mark = (studentId: number, status: string) =>
      sql(
        "INSERT INTO marks (lesson_id, student_id, status, updated_at) VALUES (?, ?, ?, 0)",
        lessonId,
        studentId,
        status,
      ).run();

    await expect(mark(first, "excellent")).rejects.toThrow(/CHECK constraint failed/);
    await mark(first, "warning");
    await mark(second, "absent");
    const markCount = () => sql("SELECT count(*) AS n FROM marks").first<number>("n");

    await sql("DELETE FROM students WHERE id = ?", first).run();
    expect(await markCount()).toBe(1);
    await sql("DELETE FROM lessons WHERE id = ?", lessonId).run();
    expect(await markCount()).toBe(0);
  });
});

describe("crypto", () => {
  it("hashes with a fresh salt and verifies", async () => {
    const a = await hashSecret("1234");
    const b = await hashSecret("1234");

    expect(a).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(await verifySecret("1234", a)).toBe(true);
    expect(await verifySecret("1235", a)).toBe(false);
    expect(await verifySecret("1234", "garbage")).toBe(false);
  });
});

describe("rate limit", () => {
  const key = "login:198.51.100.9";
  type Db = ReturnType<typeof getDb>;

  /** Makes `n` guesses at `now`; returns how many were let through to the secret check. */
  const guess = async (db: Db, n: number, now: number, k = key) => {
    let allowed = 0;
    for (let i = 0; i < n; i++) {
      try {
        await reserveAttempt(db, k, now);
        allowed++;
      } catch (e) {
        expect(e).toMatchObject({ code: "RATE_LIMITED" });
      }
    }
    return allowed;
  };
  /** How long `key` stays locked after `now`, read straight from the table. */
  const lockedFor = async (now: number, k = key): Promise<number | null> => {
    const until = await sql("SELECT locked_until FROM auth_attempts WHERE key = ?", k).first<number | null>("locked_until");
    return until != null && until > now ? until - now : null;
  };

  it("locks for 5 minutes, doubling each time up to 1 hour", async () => {
    const db = getDb(env);
    let now = 1_000_000;
    expect(await guess(db, 4, now)).toBe(4);
    expect(await lockedFor(now)).toBeNull();
    // The fifth guess is still checked, and it starts the lock straight away.
    expect(await guess(db, 1, now)).toBe(1);
    expect(await lockedFor(now)).toBe(5 * MINUTE);
    await expect(reserveAttempt(db, key, now + 5 * MINUTE - 1)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterMs: 1,
    });
    now += 5 * MINUTE;

    for (const minutes of [10, 20, 40, 60, 60]) {
      expect(await guess(db, 8, now)).toBe(5);
      expect(await lockedFor(now)).toBe(minutes * MINUTE);
      now += minutes * MINUTE;
    }
  });

  it("success resets the count and the lock level", async () => {
    const db = getDb(env);
    const now = 1_000_000;
    expect(await guess(db, 6, now)).toBe(5);
    await forgetAttempts(db, key, now);

    expect(await lockedFor(now)).toBeNull();
    expect(await guess(db, 6, now)).toBe(5);
    expect(await lockedFor(now)).toBe(5 * MINUTE);
  });

  it("a right fifth guess lifts the lock it started", async () => {
    const db = getDb(env);
    const now = 1_000_000;
    expect(await guess(db, 5, now)).toBe(5);
    await forgetAttempts(db, key, now);

    expect(await guess(db, 4, now)).toBe(4);
    expect(await lockedFor(now)).toBeNull();
  });

  it("a success also sweeps locks that ended more than a day ago", async () => {
    const db = getDb(env);
    const now = 10 * DAY;
    const stale = "pin:203.0.113.50";
    const recent = "pin:203.0.113.51";
    await guess(db, 5, now - DAY - 5 * MINUTE - 1, stale);
    await guess(db, 5, now - DAY, recent);
    await guess(db, 2, now, "setup:203.0.113.52");

    await forgetAttempts(db, key, now);

    const keys = await sql("SELECT key FROM auth_attempts ORDER BY key").all<{ key: string }>();
    expect(keys.results.map((r) => r.key)).toEqual([recent, "setup:203.0.113.52"]);
  });

  it("buckets IPv6 addresses by /64 and leaves IPv4 alone", () => {
    expect(addressBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(addressBucket("unknown")).toBe("unknown");
    expect(addressBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(addressBucket("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(addressBucket("2001:0DB8:0001:0002:0000:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(addressBucket("2001:db8:1:2::abcd")).toBe("2001:db8:1:2::/64");
    expect(addressBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressBucket("2001:db8:1::")).toBe("2001:db8:1:0::/64");
    expect(addressBucket("::1")).toBe("0:0:0:0::/64");
    expect(addressBucket("::2:3:4:5:6:7:8")).toBe("0:2:3:4::/64");
    expect(addressBucket("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
    expect(addressBucket("::1:2:3:4:192.0.2.1")).toBe("0:0:1:2::/64");
  });
});
