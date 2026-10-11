import type { ISODate } from "@shared/types.ts";

/** TanStack Query keys. Always build keys through `qk` so invalidation matches. */
export const qk = {
  auth: ["auth"],
  bootstrap: ["bootstrap"],
  day: (d: ISODate) => ["day", d] as const,
  calendar: (m: string) => ["calendar", m] as const,
  report: (f: ISODate, t: ISODate) => ["report", f, t] as const,
} as const;
