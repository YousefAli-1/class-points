import { COLORS } from "@shared/palette.ts";
import type { DayKind } from "@shared/dates.ts";
import type { ISODate, Subject } from "@shared/types.ts";
import { cx } from "../../lib/cx.ts";

export interface DayCellProps {
  date: ISODate;
  kind: DayKind;
  /** A weekday outside `schoolDays` (kept apart from `kind`, which says "future" first). */
  offDay: boolean;
  isToday: boolean;
  /** The day belongs to the next or previous month. */
  outside: boolean;
  holidayLabel?: string;
  /** Subjects with a lesson that day, in subject order. */
  subjects: readonly Subject[];
  /** Read by screen readers, e.g. "Wednesday 14 October 2026". */
  label: string;
  onPick(date: ISODate): void;
}

/** One square of the month grid: the day number, a Today chip, the holiday label and a dot per lesson. */
export function DayCell({ date, kind, offDay, isToday, outside, holidayLabel, subjects, label, onPick }: DayCellProps) {
  const future = kind === "future";
  const holiday = holidayLabel !== undefined;
  const day = Number(date.slice(8));

  const spoken = [
    label,
    isToday && "today",
    holiday && `holiday: ${holidayLabel}`,
    !holiday && offDay && "day off",
    subjects.length > 0 && `lessons: ${subjects.map((s) => s.name).join(", ")}`,
    future && "not yet",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      data-testid={`day-${date}`}
      data-kind={kind}
      data-today={isToday || undefined}
      data-outside={outside || undefined}
      aria-current={isToday ? "date" : undefined}
      aria-disabled={future || undefined}
      aria-label={spoken}
      onClick={() => onPick(date)}
      className={cx(
        "relative flex min-h-16 min-w-0 select-none flex-col items-stretch gap-0.5 rounded-xl p-1 text-left sm:min-h-[4.75rem] sm:rounded-2xl sm:p-1.5 lg:min-h-[5.25rem] lg:p-2",
        "border-2 transition-[opacity,background-color] duration-200",
        holiday
          ? "border-sunshine/70 bg-sunshine-soft [--edge:var(--color-sunshine)]"
          : offDay
            ? "border-transparent bg-mist/70 [--edge:var(--color-line)]"
            : "border-line/70 bg-white [--edge:var(--color-line)]",
        !future && "chunky",
        future && "opacity-55",
        outside && (future ? "opacity-30" : "opacity-45"),
        isToday && "z-10 border-sunshine-deep ring-4 ring-sunshine sm:ring-[5px]",
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={cx(
            "font-display text-lg leading-none font-semibold sm:text-xl lg:text-2xl",
            isToday ? "text-ink" : offDay && !holiday ? "text-muted" : "text-forest",
          )}
        >
          {day}
        </span>
        {isToday && (
          <span className="hidden rounded-full bg-sunshine px-2 py-0.5 font-display text-xs font-bold text-ink sm:inline lg:text-sm">
            Today
          </span>
        )}
        {holiday && !isToday && (
          <span aria-hidden="true" className="text-sm leading-none sm:text-base lg:text-lg">
            🎉
          </span>
        )}
      </span>

      {holiday && (
        <span className="hidden text-xs leading-tight font-bold text-honey-deep sm:line-clamp-2 lg:text-[0.8125rem]">
          {holidayLabel}
        </span>
      )}

      {subjects.length > 0 && (
        <span className="mt-auto flex flex-wrap gap-0.5 sm:gap-1">
          {subjects.map((s) => (
            <span
              key={s.id}
              data-testid="lesson-dot"
              data-subject={s.name}
              className="size-2.5 rounded-full ring-2 ring-white sm:size-3 lg:size-3.5"
              style={{ backgroundColor: COLORS[s.color].ring }}
            />
          ))}
        </span>
      )}
    </button>
  );
}
