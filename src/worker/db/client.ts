import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

export function getDb(env: { DB: D1Database }): DrizzleD1Database<typeof schema> {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
