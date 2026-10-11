import { eq, inArray } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { DEFAULT_SUBJECTS } from "@shared/palette.ts";
import { DEFAULT_POINTS } from "@shared/rules.ts";
import {
  changePasswordSchema,
  changePinSchema,
  loginSchema,
  resetSchema,
  setupSchema,
  unlockSchema,
} from "@shared/schemas.ts";
import type { AuthStatus } from "@shared/types.ts";
import type { Db } from "../db/client.ts";
import { authAttempts, sessions, settings, subjects, teacher } from "../db/schema.ts";
import { hashSecret, safeEqual, verifySecret } from "../lib/crypto.ts";
import { type AppError, badRequest, conflict, setupDisabled, unauthorized } from "../lib/errors.ts";
import { assertNotLocked, recordFailure, recordSuccess } from "../lib/rateLimit.ts";
import {
  type AppEnv,
  clearSessionCookie,
  endSession,
  isAdminUnlocked,
  lockAdmin,
  requireAdmin,
  requireAuth,
  startSession,
  unlockAdmin,
} from "../lib/session.ts";
import { parseJson } from "../lib/validate.ts";

// Spec §5 and §6. Every successful response is the new AuthStatus, so the client can
// store it as-is. Wrong secrets count towards the `kind:ip` brute-force lock.

type Ctx = Context<AppEnv>;
type AttemptKind = "login" | "pin" | "reset" | "setup";

const NOT_SET_UP = "The app isn't set up yet.";
const WRONG_SETUP_CODE = "That setup code isn't right.";

export const authRoutes = new Hono<AppEnv>();

function getTeacher(db: Db) {
  return db.select().from(teacher).where(eq(teacher.id, 1)).get();
}

/** The teacher row behind a logged-in session. */
async function sessionTeacher(db: Db) {
  const row = await getTeacher(db);
  if (!row) throw unauthorized();
  return row;
}

function clientIp(c: Ctx): string {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

function statusOf(c: Ctx, setupDone: boolean): AuthStatus {
  const session = setupDone ? c.get("session") : null;
  const adminUntil = session && isAdminUnlocked(session, Date.now()) ? session.adminUntil : null;
  return { setupDone, loggedIn: session !== null, adminUnlocked: adminUntil !== null, adminUntil };
}

/** Checks a secret under the brute-force lock: a mismatch counts a failure and throws `wrong()`. */
async function checkSecret(
  c: Ctx,
  kind: AttemptKind,
  matches: () => boolean | Promise<boolean>,
  wrong: () => AppError,
): Promise<void> {
  const db = c.get("db");
  const key = `${kind}:${clientIp(c)}`;
  const now = Date.now();
  await assertNotLocked(db, key, now);
  if (!(await matches())) {
    await recordFailure(db, key, now);
    throw wrong();
  }
  await recordSuccess(db, key);
}

authRoutes.get("/status", async (c) => {
  const setupDone = (await getTeacher(c.get("db"))) !== undefined;
  return c.json(statusOf(c, setupDone));
});

authRoutes.post("/setup", async (c) => {
  const setupCode = c.env.SETUP_CODE;
  if (!setupCode) throw setupDisabled();
  const body = await parseJson(c, setupSchema);
  const db = c.get("db");
  const alreadyDone = () => conflict("This app is already set up. Please log in.");
  if (await getTeacher(db)) throw alreadyDone();
  await checkSecret(c, "setup", () => safeEqual(body.setupCode, setupCode), () => unauthorized(WRONG_SETUP_CODE));

  const [passwordHash, pinHash] = await Promise.all([hashSecret(body.password), hashSecret(body.pin)]);
  const now = Date.now();
  try {
    await db.batch([
      db.insert(teacher).values({ id: 1, name: body.teacherName, passwordHash, pinHash, createdAt: now }),
      db.insert(settings).values({
        id: 1,
        className: body.className,
        ...DEFAULT_POINTS,
        schoolDays: body.schoolDays,
        soundOn: true,
        reportsNeedPin: false,
        lastBackupAt: null,
      }),
      db.insert(subjects).values(DEFAULT_SUBJECTS.map((s, i) => ({ ...s, sortOrder: i, archivedAt: null }))),
    ]);
  } catch (err) {
    // A parallel setup won the race for the single teacher row; the batch rolled back.
    if (await getTeacher(db)) throw alreadyDone();
    throw err;
  }
  await startSession(c);
  return c.json(statusOf(c, true));
});

authRoutes.post("/login", async (c) => {
  const { password } = await parseJson(c, loginSchema);
  const row = await getTeacher(c.get("db"));
  if (!row) throw conflict(NOT_SET_UP);
  await checkSecret(
    c,
    "login",
    () => verifySecret(password, row.passwordHash),
    () => unauthorized("That password isn't right."),
  );
  await startSession(c);
  return c.json(statusOf(c, true));
});

authRoutes.post("/logout", async (c) => {
  await endSession(c);
  const setupDone = (await getTeacher(c.get("db"))) !== undefined;
  return c.json(statusOf(c, setupDone));
});

/** Forgotten password or PIN: the setup code sets both, logs out every device and logs this one in. */
authRoutes.post("/reset", async (c) => {
  const setupCode = c.env.SETUP_CODE;
  if (!setupCode) throw setupDisabled();
  const body = await parseJson(c, resetSchema);
  const db = c.get("db");
  if (!(await getTeacher(db))) throw conflict(NOT_SET_UP);
  await checkSecret(c, "reset", () => safeEqual(body.setupCode, setupCode), () => unauthorized(WRONG_SETUP_CODE));

  const [passwordHash, pinHash] = await Promise.all([hashSecret(body.newPassword), hashSecret(body.newPin)]);
  const ip = clientIp(c);
  await db.batch([
    db.update(teacher).set({ passwordHash, pinHash }).where(eq(teacher.id, 1)),
    db.delete(sessions),
    // Lift any lock she ran into while trying to remember them.
    db.delete(authAttempts).where(inArray(authAttempts.key, [`login:${ip}`, `pin:${ip}`])),
  ]);
  await startSession(c);
  return c.json(statusOf(c, true));
});

authRoutes.post("/unlock", requireAuth, async (c) => {
  const { pin } = await parseJson(c, unlockSchema);
  const row = await sessionTeacher(c.get("db"));
  await checkSecret(c, "pin", () => verifySecret(pin, row.pinHash), () => unauthorized("That PIN isn't right."));
  await unlockAdmin(c);
  return c.json(statusOf(c, true));
});

authRoutes.post("/lock", requireAuth, async (c) => {
  await lockAdmin(c);
  return c.json(statusOf(c, true));
});

// Admin routes. A wrong "current" value is a 400, not a 401: she is still logged in.

authRoutes.post("/password", requireAdmin, async (c) => {
  const { currentPassword, newPassword } = await parseJson(c, changePasswordSchema);
  const db = c.get("db");
  const row = await sessionTeacher(db);
  await checkSecret(
    c,
    "login",
    () => verifySecret(currentPassword, row.passwordHash),
    () => badRequest("Your current password isn't right."),
  );
  await db
    .update(teacher)
    .set({ passwordHash: await hashSecret(newPassword) })
    .where(eq(teacher.id, 1));
  return c.json(statusOf(c, true));
});

authRoutes.post("/pin", requireAdmin, async (c) => {
  const { currentPin, newPin } = await parseJson(c, changePinSchema);
  const db = c.get("db");
  const row = await sessionTeacher(db);
  await checkSecret(
    c,
    "pin",
    () => verifySecret(currentPin, row.pinHash),
    () => badRequest("Your current PIN isn't right."),
  );
  await db
    .update(teacher)
    .set({ pinHash: await hashSecret(newPin) })
    .where(eq(teacher.id, 1));
  return c.json(statusOf(c, true));
});

/** Ends every session, this one included. */
authRoutes.post("/logout-all", requireAdmin, async (c) => {
  await c.get("db").delete(sessions);
  clearSessionCookie(c);
  return c.json(statusOf(c, true));
});
