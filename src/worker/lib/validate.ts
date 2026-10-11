import type { Context } from "hono";
import type { ZodType } from "zod";
import { badRequest } from "./errors.ts";

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest(result.error.issues[0]?.message ?? "Please check the details and try again.");
  return result.data;
}

/** Parses the JSON body with `schema`. Throws `badRequest` with the first issue's message. */
export async function parseJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest("The request body must be valid JSON.");
  }
  return parse(schema, body);
}

/** Parses the query string with `schema`. Throws `badRequest` with the first issue's message. */
export function parseQuery<T>(c: Context, schema: ZodType<T>): T {
  return parse(schema, c.req.query());
}
