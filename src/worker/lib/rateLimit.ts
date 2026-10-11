import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { authAttempts } from "../db/schema.ts";
import { rateLimited } from "./errors.ts";

// Brute-force protection per `kind:ip` key (spec §5): five failures lock the key for
// 5 minutes, doubling with each lock up to 1 hour. A success forgets the key.

const MAX_FAILURES = 5;
const BASE_LOCK_MS = 5 * 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;
/** 5 min * 2^4 already passes the cap, so the level never needs to grow past this. */
const MAX_LOCK_LEVEL = 4;

export async function assertNotLocked(db: Db, key: string, now: number): Promise<void> {
  const row = await db
    .select({ lockedUntil: authAttempts.lockedUntil })
    .from(authAttempts)
    .where(eq(authAttempts.key, key))
    .get();
  if (row?.lockedUntil != null && row.lockedUntil > now) throw rateLimited(row.lockedUntil - now);
}

/** Counts a failure in one statement, so parallel requests can't lose a count. */
export async function recordFailure(db: Db, key: string, now: number): Promise<void> {
  const { failures, lockedUntil, lockLevel } = authAttempts;
  const locks = sql`${failures} + 1 >= ${MAX_FAILURES}`;
  const lockMs = sql`MIN(${BASE_LOCK_MS} * (1 << ${lockLevel}), ${MAX_LOCK_MS})`;
  await db
    .insert(authAttempts)
    .values({ key, failures: 1, lockedUntil: null, lockLevel: 0 })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: {
        failures: sql`CASE WHEN ${locks} THEN 0 ELSE ${failures} + 1 END`,
        lockedUntil: sql`CASE WHEN ${locks} THEN ${now} + ${lockMs} ELSE ${lockedUntil} END`,
        lockLevel: sql`CASE WHEN ${locks} THEN MIN(${lockLevel} + 1, ${MAX_LOCK_LEVEL}) ELSE ${lockLevel} END`,
      },
    });
}

export async function recordSuccess(db: Db, key: string): Promise<void> {
  await db.delete(authAttempts).where(eq(authAttempts.key, key));
}
