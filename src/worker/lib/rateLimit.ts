import { eq, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { authAttempts } from "../db/schema.ts";
import { rateLimited } from "./errors.ts";

// Brute-force protection per `kind:address` key (spec §5): five failures lock the key for
// 5 minutes, doubling with each lock up to 1 hour. A success forgets the key.
//
// Every attempt reserves its slot before the secret is checked, in one statement, and a success
// gives the slot back by deleting the row. So a burst of parallel requests can't all pass a
// "not locked yet" check before the first failure is written: at most five get to guess.

const MAX_FAILURES = 5;
const BASE_LOCK_MS = 5 * 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;
/** 5 min * 2^4 already passes the cap, so the level never needs to grow past this. */
const MAX_LOCK_LEVEL = 4;
/** Rows whose lock ended longer ago than this are swept away on the next success. */
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * The part of a client address that a lock applies to. IPv4 counts per address. IPv6 counts per
 * /64, since one home line or server usually holds a whole /64 and could use a fresh address for
 * every guess. Different spellings of one IPv6 address give the same key.
 */
export function addressBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];

  const groupsOf = (part: string) => (part ? part.split(":") : []);
  // An embedded IPv4 tail ("64:ff9b::192.0.2.1") fills the last two groups.
  const width = (groups: string[]) => groups.reduce((n, g) => n + (g.includes(".") ? 2 : 1), 0);
  const [head, tail] = ip.split("::", 2);
  const left = groupsOf(head);
  const right = tail === undefined ? [] : groupsOf(tail);
  const zeros = tail === undefined ? [] : Array<string>(Math.max(0, 8 - width(left) - width(right))).fill("0");
  const prefix = [...left, ...zeros, ...right].slice(0, 4);
  while (prefix.length < 4) prefix.push("0");
  return `${prefix.map((g) => (parseInt(g, 16) || 0).toString(16)).join(":")}::/64`;
}

/**
 * Takes one guess for `key`, or throws RATE_LIMITED while the key is locked. The fifth guess in a
 * row starts the lock straight away; if that guess turns out right, `forgetAttempts` lifts it.
 */
export async function reserveAttempt(db: Db, key: string, now: number): Promise<void> {
  const { failures, lockedUntil, lockLevel } = authAttempts;
  const locked = sql`${lockedUntil} > ${now}`;
  // A lock that has run out starts a new run of five; the lock level stays until a success.
  const expired = sql`${lockedUntil} <= ${now}`;
  const next = sql`(CASE WHEN ${expired} THEN 0 ELSE ${failures} END) + 1`;
  const locks = sql`${next} >= ${MAX_FAILURES}`;
  const lockMs = sql`MIN(${BASE_LOCK_MS} * (1 << ${lockLevel}), ${MAX_LOCK_MS})`;

  const row = await db
    .insert(authAttempts)
    .values({ key, failures: 1, lockedUntil: null, lockLevel: 0 })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: {
        // While locked the row is left alone, apart from marking this request as over the limit.
        failures: sql`CASE WHEN ${locked} THEN ${MAX_FAILURES + 1} ELSE ${next} END`,
        lockedUntil: sql`CASE WHEN ${locked} THEN ${lockedUntil} WHEN ${locks} THEN ${now} + ${lockMs} ELSE NULL END`,
        lockLevel: sql`CASE WHEN ${locked} THEN ${lockLevel} WHEN ${locks} THEN MIN(${lockLevel} + 1, ${MAX_LOCK_LEVEL}) ELSE ${lockLevel} END`,
      },
    })
    .returning({ failures, lockedUntil })
    .get();

  if (row.failures > MAX_FAILURES) throw rateLimited(Math.max(1, (row.lockedUntil ?? now) - now));
}

/** After a right guess: forgets `key` (its count and lock level) and sweeps long-finished locks. */
export async function forgetAttempts(db: Db, key: string, now: number): Promise<void> {
  await db.delete(authAttempts).where(or(eq(authAttempts.key, key), lt(authAttempts.lockedUntil, now - STALE_MS)));
}
