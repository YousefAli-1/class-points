import type { ISODate, MarkStatus, PointValues, Student } from "./types.ts";

export const DEFAULT_POINTS: PointValues = { pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 };

/** The three buttons on a student tile. */
export type MarkAction = "warning" | "penalty" | "absent";

export type TransitionResult = { ok: true; status: MarkStatus } | { ok: false; reason: "NEED_WARNING" | "ABSENT" };

/** The tap transitions from spec §4.1. */
export function applyAction(current: MarkStatus, action: MarkAction): TransitionResult {
  if (action === "absent") {
    return { ok: true, status: current === "absent" ? "clean" : "absent" };
  }
  if (current === "absent") return { ok: false, reason: "ABSENT" };

  if (action === "warning") {
    // Removing the Warning also removes the Penalty.
    return { ok: true, status: current === "clean" ? "warning" : "clean" };
  }

  if (current === "clean") return { ok: false, reason: "NEED_WARNING" };
  return { ok: true, status: current === "warning" ? "penalty" : "warning" };
}

/** Points a status earns under a lesson's values; `null` for absent (no points, not in totals). */
export function pointsFor(status: MarkStatus, values: PointValues): number | null {
  switch (status) {
    case "clean":
      return values.pointsClean;
    case "warning":
      return values.pointsWarning;
    case "penalty":
      return values.pointsPenalty;
    case "absent":
      return null;
  }
}

export function hasWarningCard(s: MarkStatus): boolean {
  return s === "warning" || s === "penalty";
}

export function hasPenaltyCard(s: MarkStatus): boolean {
  return s === "penalty";
}

export const MIN_POINTS = -10;
export const MAX_POINTS = 10;

/** `null` when valid, otherwise a message for the teacher. */
export function validatePointValues(v: PointValues): string | null {
  const values = [v.pointsClean, v.pointsWarning, v.pointsPenalty];
  if (!values.every((n) => Number.isInteger(n) && n >= MIN_POINTS && n <= MAX_POINTS)) {
    return "Points must be whole numbers from −10 to 10.";
  }
  if (v.pointsClean < v.pointsWarning) {
    return "No cards must be worth at least as much as a Warning.";
  }
  if (v.pointsWarning < v.pointsPenalty) {
    return "A Warning must be worth at least as much as Warning + Penalty.";
  }
  return null;
}

/** A student belongs to a lesson on `date` when activeFrom <= date < archivedAt. */
export function isEligible(s: Pick<Student, "activeFrom" | "archivedAt">, date: ISODate): boolean {
  return s.activeFrom <= date && (s.archivedAt === null || date < s.archivedAt);
}

/** '+1', '0', '−1' (with a true minus sign, U+2212). */
export function formatPoints(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return "0";
}
