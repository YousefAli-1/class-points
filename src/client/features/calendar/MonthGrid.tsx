import { useMemo } from "react";
import { dayKind, formatLongDate, holidayOn, monthGrid, monthOf, weekdayOf } from "@shared/dates.ts";
import type { CalendarResponse, Holiday, ISODate, Subject } from "@shared/types.ts";
import { cx } from "../../lib/cx.ts";
import { DayCell } from "./DayCell.tsx";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface MonthGridProps {
  /** 'YYYY-MM'. */
  month: string;
  weekStart: number;
  today: ISODate;
  schoolDays: readonly number[];
  holidays: readonly Holiday[];
  subjects: readonly Subject[];
  lessons: CalendarResponse["lessons"];
  onPick(date: ISODate): void;
}

/** Subjects with a lesson on each date, ordered by `sortOrder`. */
function subjectsByDate(lessons: CalendarResponse["lessons"], subjects: readonly Subject[]): Map<ISODate, Subject[]> {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const out = new Map<ISODate, Subject[]>();
  for (const lesson of lessons) {
    const subject = byId.get(lesson.subjectId);
    if (!subject) continue;
    const list = out.get(lesson.date) ?? [];
    if (!list.includes(subject)) list.push(subject);
    out.set(lesson.date, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  return out;
}

function spokenDate(date: ISODate): string {
  const { weekday, full } = formatLongDate(date);
  return `${weekday} ${full}`;
}

/** Weekday headers and the 4–6 week rows of one month. */
export function MonthGrid({ month, weekStart, today, schoolDays, holidays, subjects, lessons, onPick }: MonthGridProps) {
  const weeks = useMemo(() => monthGrid(month, weekStart), [month, weekStart]);
  const dots = useMemo(() => subjectsByDate(lessons, subjects), [lessons, subjects]);
  const columns = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

  return (
    <div className="flex flex-col gap-1.5 sm:gap-2">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 sm:gap-1.5 lg:gap-2">
        {columns.map((weekday) => (
          <span
            key={weekday}
            data-testid="weekday"
            className={cx(
              "text-center font-display text-sm font-semibold uppercase tracking-wide sm:text-base",
              schoolDays.includes(weekday) ? "text-leaf-deep" : "text-muted/80",
            )}
          >
            {WEEKDAYS[weekday]}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 lg:gap-2">
        {weeks.flat().map((date) => (
          <DayCell
            key={date}
            date={date}
            kind={dayKind(date, today, schoolDays, holidays)}
            offDay={!schoolDays.includes(weekdayOf(date))}
            isToday={date === today}
            outside={monthOf(date) !== month}
            holidayLabel={holidayOn(date, holidays)?.label}
            subjects={dots.get(date) ?? []}
            label={spokenDate(date)}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}
