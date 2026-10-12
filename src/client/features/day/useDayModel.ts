import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { dayKind, holidayOn, monthOf, type DayKind } from "@shared/dates.ts";
import { applyAction, isEligible, type MarkAction, type TransitionResult } from "@shared/rules.ts";
import type { DayLesson, DayResponse, ISODate, MarkStatus, Student, Subject } from "@shared/types.ts";
import { api } from "../../lib/api.ts";
import { useBootstrap, useDay, useToday } from "../../lib/queries.ts";
import { qk } from "../../lib/queryKeys.ts";
import { useSaveQueue } from "../../lib/saveQueueContext.ts";
import { useSound, type SoundName } from "../../lib/sound.ts";

export interface DayCounts {
  clean: number;
  warnings: number;
  penalties: number;
  absent: number;
}

export interface DayModel {
  /** False until the class data and the day have loaded. */
  ready: boolean;
  /** The day or the class data couldn't be loaded. */
  failed: boolean;
  retry(): void;
  subjects: Subject[];
  /** 0 while loading or when the class has no subjects. */
  subjectId: number;
  setSubjectId(id: number): void;
  lesson: DayLesson | null;
  /** The students who belong to this date, in class order. */
  students: Student[];
  statusOf(studentId: number): MarkStatus;
  act(studentId: number, action: MarkAction): TransitionResult;
  startLesson(): Promise<void>;
  cancelLesson(): Promise<void>;
  kind: DayKind;
  /** The holiday's name when `kind` is "holiday". */
  holidayLabel: string | null;
  counts: DayCounts;
  /** Subject ids with a lesson on this date. */
  startedSubjectIds: ReadonlySet<number>;
}

/** The sound for a tap that went through (spec §8.4). */
function soundFor(action: MarkAction, from: MarkStatus, to: MarkStatus): SoundName {
  if (action === "absent") return to === "absent" ? "whoosh" : "pop";
  const cardOn = action === "warning" ? from === "clean" : to === "penalty";
  return cardOn ? "boop" : "sparkle";
}

function withLesson(day: DayResponse | undefined, lesson: DayLesson): DayResponse | undefined {
  if (!day) return day;
  const others = day.lessons.filter((l) => l.id !== lesson.id && l.subjectId !== lesson.subjectId);
  return { ...day, lessons: [...others, lesson] };
}

/** Everything the day view shows and does for `date` (spec §8.4). */
export function useDayModel(date: ISODate): DayModel {
  const qc = useQueryClient();
  const today = useToday();
  const bootstrap = useBootstrap();
  const day = useDay(date);
  const { enqueueMark } = useSaveQueue();
  const play = useSound();
  const [params, setParams] = useSearchParams();

  const boot = bootstrap.data;
  const lessons = useMemo(() => day.data?.lessons ?? [], [day.data]);
  const startedSubjectIds = useMemo(() => new Set(lessons.map((l) => l.subjectId)), [lessons]);

  // Active subjects, plus archived ones that still have a lesson on this date.
  const subjects = useMemo(
    () =>
      (boot?.subjects ?? [])
        .filter((s) => s.archivedAt === null || startedSubjectIds.has(s.id))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [boot, startedSubjectIds],
  );

  const requested = Number(params.get("subject"));
  const subjectId =
    subjects.find((s) => s.id === requested)?.id ??
    subjects.find((s) => startedSubjectIds.has(s.id))?.id ??
    subjects.find((s) => s.archivedAt === null)?.id ??
    0;

  const setSubjectId = useCallback(
    (id: number) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("subject", String(id));
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const lesson = lessons.find((l) => l.subjectId === subjectId) ?? null;

  const students = useMemo(
    () => (boot?.students ?? []).filter((s) => isEligible(s, date)).sort((a, b) => a.sortOrder - b.sortOrder),
    [boot, date],
  );

  const statusOf = useCallback((studentId: number): MarkStatus => lesson?.marks[studentId]?.status ?? "clean", [lesson]);

  const act = useCallback(
    (studentId: number, action: MarkAction): TransitionResult => {
      const from = statusOf(studentId);
      const result = applyAction(from, action);
      if (result.ok) {
        if (lesson) enqueueMark(date, lesson.id, studentId, result.status);
        play(soundFor(action, from, result.status));
      } else if (result.reason === "NEED_WARNING") {
        play("nope");
      }
      return result;
    },
    [statusOf, lesson, enqueueMark, date, play],
  );

  const refreshCalendar = useCallback(
    () => void qc.invalidateQueries({ queryKey: qk.calendar(monthOf(date)) }),
    [qc, date],
  );

  const start = useMutation({
    mutationFn: () => api.createLesson(date, subjectId),
    onSuccess: (created) => {
      qc.setQueryData<DayResponse>(qk.day(date), (d) => withLesson(d, created));
      refreshCalendar();
    },
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api.deleteLesson(id),
    onSuccess: (_void, id) => {
      qc.setQueryData<DayResponse>(qk.day(date), (d) => d && { ...d, lessons: d.lessons.filter((l) => l.id !== id) });
      refreshCalendar();
    },
    // A lesson that is already gone (another device cancelled it) should disappear here too.
    onError: () => void qc.invalidateQueries({ queryKey: qk.day(date) }),
  });

  const startLesson = useCallback(async () => {
    if (subjectId) await start.mutateAsync();
  }, [start, subjectId]);

  const cancelLesson = useCallback(async () => {
    if (lesson) await cancel.mutateAsync(lesson.id);
  }, [cancel, lesson]);

  const settings = boot?.settings;
  const holidays = useMemo(() => boot?.holidays ?? [], [boot]);
  const kind = dayKind(date, today, settings?.schoolDays ?? [0, 1, 2, 3, 4, 5, 6], holidays);
  const holidayLabel = kind === "holiday" ? (holidayOn(date, holidays)?.label ?? null) : null;

  const counts = useMemo(() => {
    const c: DayCounts = { clean: 0, warnings: 0, penalties: 0, absent: 0 };
    for (const s of students) {
      const status = lesson?.marks[s.id]?.status ?? "clean";
      if (status === "clean") c.clean++;
      else if (status === "warning") c.warnings++;
      else if (status === "penalty") c.penalties++;
      else c.absent++;
    }
    return c;
  }, [students, lesson]);

  const retry = useCallback(() => {
    if (bootstrap.isError) void bootstrap.refetch();
    if (day.isError) void day.refetch();
  }, [bootstrap, day]);

  return {
    ready: Boolean(boot && day.data),
    failed: (bootstrap.isError && !boot) || (day.isError && !day.data),
    retry,
    subjects,
    subjectId,
    setSubjectId,
    lesson,
    students,
    statusOf,
    act,
    startLesson,
    cancelLesson,
    kind,
    holidayLabel,
    counts,
    startedSubjectIds,
  };
}
