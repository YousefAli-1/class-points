import type { z } from "zod";

/** The first problem `schema` finds with `value`, as a message for the field, or undefined. */
export function problemWith(schema: z.ZodType, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/** Field errors without the empty entries, or null when there are none. */
export function onlyProblems<K extends string>(errors: Record<K, string | undefined>): Partial<Record<K, string>> | null {
  const found = Object.entries(errors).filter(([, message]) => message) as [K, string][];
  return found.length ? (Object.fromEntries(found) as Partial<Record<K, string>>) : null;
}

/** Props that keep a PIN field masked and bring up the number keyboard. */
export const PIN_INPUT = {
  type: "password",
  inputMode: "numeric",
  pattern: "[0-9]*",
  maxLength: 6,
  autoComplete: "off",
} as const;
