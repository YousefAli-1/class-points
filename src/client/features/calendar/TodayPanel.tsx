import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { dayKind, formatLongDate, holidayOn, monthOf } from "@shared/dates.ts";
import { COLORS } from "@shared/palette.ts";
import type { Bootstrap, DayLesson, DayResponse, ISODate, Subject } from "@shared/types.ts";
import { Mascot } from "../../components/Mascot.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { Spinner } from "../../components/ui/Spinner.tsx";
import { api } from "../../lib/api.ts";
import { celebrate } from "../../lib/confetti.ts";
import { cx } from "../../lib/cx.ts";
import { greeting } from "../../lib/format.ts";
import { useDay } from "../../lib/queries.ts";
import { qk } from "../../lib/queryKeys.ts";
import { useSound } from "../../lib/sound.ts";

export interface TodayPanelProps {
  today: ISODate;
  boot: Bootstrap;
  className?: string;
}

/** "Sunday, 11 October" (no year: it is today). */
function todayHeadline(today: ISODate): { weekday: string; date: string } {
  const { weekday, full } = formatLongDate(today);
  return { weekday, date: full.split(" ").slice(0, 2).join(" ") };
}

/** Puts a freshly started lesson into the cached day, so the day view opens on it straight away. */
function withLesson(day: DayResponse | undefined, lesson: DayLesson): DayResponse | undefined {
  if (!day || day.lessons.some((l) => l.id === lesson.id)) return day;
  return { ...day, lessons: [...day.lessons, lesson] };
}

function SubjectButton({
  subject,
  started,
  busy,
  disabled,
  onClick,
}: {
  subject: Subject;
  started: boolean;
  busy: boolean;
  disabled: boolean;
  onClick(): void;
}) {
  const tint = COLORS[subject.color];
  return (
    <li>
      <button
        type="button"
        aria-label={`${started ? "Continue" : "Start"} ${subject.name}`}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          // One row on phones and in the narrow landscape panel; in the portrait grid the action sits under the name.
          "chunky flex min-h-[4.5rem] w-full select-none flex-wrap items-center gap-x-3 gap-y-2 rounded-[1.25rem] border-2 py-2 pr-2 pl-2.5 text-left",
          "disabled:cursor-not-allowed",
          disabled && !busy && "opacity-60",
        )}
        style={{ backgroundColor: tint.bg, borderColor: tint.ring, "--edge": tint.ring } as CSSProperties}
      >
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-[1.75rem] leading-none shadow-sm"
        >
          {subject.emoji}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-ink">{subject.name}</span>
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-4 font-display text-xl font-bold sm:basis-full lg:basis-auto",
            started
              ? "bg-white text-leaf-deep ring-2 ring-leaf/40"
              : "bg-leaf text-white [text-shadow:0_1px_0_rgb(11_58_30/0.3)]",
          )}
        >
          {busy ? <Spinner size={22} /> : started ? "✓" : "▶"}
          {started ? "Continue" : "Start"}
        </span>
      </button>
    </li>
  );
}

/** The greeting and today's subjects as Start / Continue buttons (spec §8.3). */
export function TodayPanel({ today, boot, className }: TodayPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const play = useSound();
  const day = useDay(today).data;
  const [confirming, setConfirming] = useState<Subject | null>(null);

  const { settings, subjects, holidays } = boot;
  const active = subjects.filter((s) => s.archivedAt === null).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const startedIds = new Set(day?.lessons.map((l) => l.subjectId) ?? []);
  const kind = dayKind(today, today, settings.schoolDays, holidays);
  const holiday = holidayOn(today, holidays);
  const headline = todayHeadline(today);

  const start = useMutation({
    mutationFn: (subject: Subject) => api.createLesson(today, subject.id),
    onSuccess: (lesson, subject) => {
      queryClient.setQueryData<DayResponse>(qk.day(today), (old) => withLesson(old, lesson));
      void queryClient.invalidateQueries({ queryKey: qk.calendar(monthOf(today)) });
      play("ding");
      celebrate("start");
      void navigate(`/day/${today}?subject=${subject.id}`);
    },
  });

  function open(subject: Subject) {
    if (startedIds.has(subject.id)) {
      void navigate(`/day/${today}?subject=${subject.id}`);
    } else if (kind === "holiday" || kind === "off") {
      setConfirming(subject);
    } else {
      start.mutate(subject);
    }
  }

  return (
    <Card className={cx("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-3">
        <Mascot mood="wave" size={84} className="-my-2 -ml-1" />
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight sm:text-3xl">
            {greeting()}, {settings.teacherName}!
          </h1>
          <p className="mt-1 text-lg text-muted">
            Today is{" "}
            <strong className="font-display font-semibold text-forest">
              {headline.weekday}, {headline.date}
            </strong>
          </p>
        </div>
      </div>

      {kind === "holiday" && holiday && (
        <p className="rounded-2xl bg-sunshine-soft px-4 py-2.5 text-lg font-bold text-honey-deep">
          <span aria-hidden="true">🎉 </span>
          {holiday.label}: no school today
        </p>
      )}
      {kind === "off" && (
        <p className="rounded-2xl bg-mist px-4 py-2.5 text-lg font-bold text-muted">
          <span aria-hidden="true">😴 </span>
          It&rsquo;s a day off. Enjoy it!
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <h2 className="text-xl">Today&rsquo;s lessons</h2>
        <ul aria-label="Today's subjects" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1">
          {active.map((subject) => (
            <SubjectButton
              key={subject.id}
              subject={subject}
              started={startedIds.has(subject.id)}
              busy={start.isPending && start.variables.id === subject.id}
              disabled={start.isPending}
              onClick={() => open(subject)}
            />
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(next) => !next && setConfirming(null)}
        title={kind === "holiday" ? "Today is a holiday 🎉" : "Today is a day off"}
        description={
          kind === "holiday" && holiday
            ? `It's ${holiday.label}. Start ${confirming?.name ?? "the"} lesson anyway?`
            : `There's no school today. Start ${confirming?.name ?? "the"} lesson anyway?`
        }
        confirmLabel="Start lesson"
        tone="primary"
        onConfirm={async () => {
          if (confirming) await start.mutateAsync(confirming);
        }}
      />
    </Card>
  );
}
