import { eq, lt, or } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { generateCookie, getCookie } from "hono/cookie";
import type { Db } from "../db/client.ts";
import { sessions } from "../db/schema.ts";
import { randomToken, sha256Hex } from "./crypto.ts";
import { adminLocked, unauthorized } from "./errors.ts";

export const SESSION_COOKIE = "cp_session";
export const SESSION_DAYS = 60;
export const ADMIN_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MS = SESSION_DAYS * DAY_MS;
/** A session with less than this left is renewed to a full SESSION_DAYS. */
const RENEW_BELOW_MS = 30 * DAY_MS;
const ADMIN_MS = ADMIN_MINUTES * 60 * 1000;

export type SessionRow = typeof sessions.$inferSelect;

export type AppEnv = {
  Bindings: Env & { SETUP_CODE?: string };
  Variables: { session: SessionRow | null; db: Db };
};

/**
 * Sets (or, with an empty token, clears) the session cookie. It replaces any Set-Cookie written
 * earlier in the same request, so the last decision wins (e.g. a stale cookie cleared, then a login).
 */
function writeSessionCookie(c: Context<AppEnv>, token: string): void {
  const cookie = generateCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: token ? SESSION_MS / 1000 : 0,
  });
  c.header("Set-Cookie", cookie);
}

/** True while the PIN unlock of this session is still valid. */
export function isAdminUnlocked(session: SessionRow | null, now: number): boolean {
  return session?.adminUntil != null && session.adminUntil > now;
}

/** Reads the session cookie into `c.var.session` (or null), renewing a session that is getting old. */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("session", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = c.get("db");
    const idHash = await sha256Hex(token);
    const row = await db.select().from(sessions).where(eq(sessions.idHash, idHash)).get();
    const now = Date.now();
    if (row && row.expiresAt > now) {
      if (row.expiresAt - now < RENEW_BELOW_MS) {
        const expiresAt = now + SESSION_MS;
        await db.update(sessions).set({ expiresAt }).where(eq(sessions.idHash, idHash));
        writeSessionCookie(c, token);
        c.set("session", { ...row, expiresAt });
      } else {
        c.set("session", row);
      }
    } else {
      if (row) await db.delete(sessions).where(eq(sessions.idHash, idHash));
      clearSessionCookie(c);
    }
  }
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("session")) throw unauthorized();
  await next();
};

/** Needs a PIN unlock that hasn't expired, and keeps it alive for another ADMIN_MINUTES. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = c.get("session");
  if (!session) throw unauthorized();
  if (!isAdminUnlocked(session, Date.now())) throw adminLocked();
  await unlockAdmin(c);
  await next();
};

/** Unlocks admin on the current session for ADMIN_MINUTES. */
export async function unlockAdmin(c: Context<AppEnv>): Promise<void> {
  await setAdminUntil(c, Date.now() + ADMIN_MS);
}

/** Locks admin on the current session. */
export async function lockAdmin(c: Context<AppEnv>): Promise<void> {
  await setAdminUntil(c, null);
}

async function setAdminUntil(c: Context<AppEnv>, adminUntil: number | null): Promise<void> {
  const session = c.get("session");
  if (!session) throw unauthorized();
  await c.get("db").update(sessions).set({ adminUntil }).where(eq(sessions.idHash, session.idHash));
  c.set("session", { ...session, adminUntil });
}

/** Starts a new session (replacing the current one, if any) and sets the cookie. */
export async function startSession(c: Context<AppEnv>): Promise<void> {
  const db = c.get("db");
  const now = Date.now();
  const token = randomToken();
  const row: SessionRow = {
    idHash: await sha256Hex(token),
    createdAt: now,
    expiresAt: now + SESSION_MS,
    adminUntil: null,
  };
  const previous = c.get("session");
  // Also sweeps out expired sessions, so the table doesn't grow forever.
  const stale = previous
    ? or(lt(sessions.expiresAt, now), eq(sessions.idHash, previous.idHash))
    : lt(sessions.expiresAt, now);
  await db.batch([db.delete(sessions).where(stale), db.insert(sessions).values(row)]);
  writeSessionCookie(c, token);
  c.set("session", row);
}

/** Ends the current session (if any) and clears the cookie. */
export async function endSession(c: Context<AppEnv>): Promise<void> {
  const session = c.get("session");
  if (session) await c.get("db").delete(sessions).where(eq(sessions.idHash, session.idHash));
  clearSessionCookie(c);
}

/** Clears the cookie and forgets the session for the rest of this request. */
export function clearSessionCookie(c: Context<AppEnv>): void {
  writeSessionCookie(c, "");
  c.set("session", null);
}
