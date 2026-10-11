import { z } from "zod";
import { daysBetween, isValidISODate } from "./dates.ts";
import { COLOR_KEYS } from "./palette.ts";
import { MAX_POINTS, MIN_POINTS } from "./rules.ts";

// Request payload schemas shared by the worker (validation) and the client (forms).

const MAX_HOLIDAY_DAYS = 366;
const MAX_REPORT_DAYS = 400;

// Range checks only judge real dates: an invalid date already reports its own error.
const bothValid = (from: string, to: string) => isValidISODate(from) && isValidISODate(to);
const isOrdered = (from: string, to: string) => !bothValid(from, to) || to >= from;
/** True when the range, counting both ends, is at most `maxDays` long. */
const fitsIn = (from: string, to: string, maxDays: number) =>
  !bothValid(from, to) || daysBetween(from, to) + 1 <= maxDays;

export const isoDateSchema = z.string().refine(isValidISODate, "Use a date like 2026-10-11.");

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-10.");

export const statusSchema = z.enum(["clean", "warning", "penalty", "absent"]);

export const pinSchema = z.string().regex(/^\d{4,6}$/, "The PIN is 4 to 6 digits.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That password is too long.");

export const personNameSchema = z.string().trim().min(1, "Enter a name.").max(40, "Names can be up to 40 characters.");

export const classNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a class name.")
  .max(40, "Class names can be up to 40 characters.");

/** Weekday numbers 0 (Sunday) to 6 (Saturday). Duplicates are dropped and the days come back sorted. */
export const schoolDaysSchema = z
  .array(z.int().min(0).max(6))
  .min(1, "Pick at least one school day.")
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

const colorSchema = z.enum(COLOR_KEYS);
const emojiSchema = z.string().trim().min(1, "Pick an emoji.").max(16);
const idSchema = z.int().positive();
const pointsSchema = z.int().min(MIN_POINTS).max(MAX_POINTS);
/** Login and "current" fields accept any non-empty value, so a wrong guess counts as a failed attempt. */
const enteredPasswordSchema = z.string().min(1, "Enter your password.").max(200);
const setupCodeSchema = z.string().min(1, "Enter the setup code.").max(200);

export const setupSchema = z.object({
  setupCode: setupCodeSchema,
  teacherName: personNameSchema,
  className: classNameSchema,
  password: passwordSchema,
  pin: pinSchema,
  schoolDays: schoolDaysSchema,
});

export const loginSchema = z.object({ password: enteredPasswordSchema });

export const resetSchema = z.object({
  setupCode: setupCodeSchema,
  newPassword: passwordSchema,
  newPin: pinSchema,
});

export const unlockSchema = z.object({ pin: pinSchema });

export const changePasswordSchema = z.object({
  currentPassword: enteredPasswordSchema,
  newPassword: passwordSchema,
});

export const changePinSchema = z.object({ currentPin: pinSchema, newPin: pinSchema });

/** Any subset of the editable settings. The point ordering is checked against the merged result. */
export const settingsPatchSchema = z
  .object({
    teacherName: personNameSchema,
    className: classNameSchema,
    pointsClean: pointsSchema,
    pointsWarning: pointsSchema,
    pointsPenalty: pointsSchema,
    schoolDays: schoolDaysSchema,
    soundOn: z.boolean(),
    reportsNeedPin: z.boolean(),
  })
  .partial();

export const studentsCreateSchema = z.object({
  names: z.array(personNameSchema).min(1, "Add at least one name.").max(60, "Add up to 60 students at a time."),
  activeFrom: isoDateSchema,
});

export const studentPatchSchema = z
  .object({ name: personNameSchema, avatar: emojiSchema, color: colorSchema, activeFrom: isoDateSchema })
  .partial();

export const archiveSchema = z.object({ date: isoDateSchema });

export const reorderSchema = z.object({
  ids: z
    .array(idSchema)
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, "Each item can appear only once."),
});

export const subjectCreateSchema = z.object({
  name: z.string().trim().min(1, "Enter a subject name.").max(30, "Subject names can be up to 30 characters."),
  emoji: emojiSchema,
  color: colorSchema,
});

export const subjectPatchSchema = subjectCreateSchema.partial();

export const holidayCreateSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    label: z.string().trim().min(1, "Give the holiday a name.").max(40, "Holiday names can be up to 40 characters."),
  })
  .refine((h) => isOrdered(h.startDate, h.endDate), {
    error: "The last day can't be before the first day.",
    path: ["endDate"],
  })
  .refine((h) => fitsIn(h.startDate, h.endDate, MAX_HOLIDAY_DAYS), {
    error: `A holiday can be at most ${MAX_HOLIDAY_DAYS} days long.`,
    path: ["endDate"],
  });

export const lessonCreateSchema = z.object({ date: isoDateSchema, subjectId: idSchema });

export const markPutSchema = z.object({ status: statusSchema, clientTs: z.int().min(0) });

export const reportQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((q) => isOrdered(q.from, q.to), { error: "`to` can't be before `from`.", path: ["to"] })
  .refine((q) => fitsIn(q.from, q.to, MAX_REPORT_DAYS), {
    error: `Reports can cover at most ${MAX_REPORT_DAYS} days.`,
    path: ["to"],
  });
