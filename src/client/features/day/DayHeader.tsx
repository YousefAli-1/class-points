import { Link, useLocation, useNavigate } from "react-router";
import { addDays, formatLongDate } from "@shared/dates.ts";
import type { ISODate, Subject } from "@shared/types.ts";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/icons.tsx";
import { BUTTON_VARIANTS, IconButton, SelectPill } from "../../components/ui/index.ts";
import { cx } from "../../lib/cx.ts";

export interface DayHeaderProps {
  date: ISODate;
  today: ISODate;
  subjects: Subject[];
  subjectId: number;
  onSubjectChange(id: number): void;
  startedSubjectIds: ReadonlySet<number>;
}

/** ← Calendar, the weekday and date with ‹ › arrows, and the subject picker (spec §8.4). */
export function DayHeader({ date, today, subjects, subjectId, onSubjectChange, startedSubjectIds }: DayHeaderProps) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { weekday, full } = formatLongDate(date);
  const next = addDays(date, 1);
  // Keep the chosen subject while stepping through the days.
  const go = (d: ISODate) => void navigate(`/day/${d}${search}`);

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Link
        to="/"
        className={cx(
          BUTTON_VARIANTS.secondary,
          "inline-flex min-h-14 min-w-14 select-none items-center justify-center gap-1.5 rounded-full px-3 font-display text-xl font-bold sm:pr-5",
        )}
      >
        <ArrowLeftIcon size={24} />
        <span className="max-sm:sr-only">Calendar</span>
      </Link>

      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton label="Previous day" icon={<ChevronLeftIcon size={28} />} onClick={() => go(addDays(date, -1))} />
        <div className="min-w-0 px-1 text-center sm:min-w-[14.5rem]">
          <h1 className="truncate text-[2rem] leading-none sm:text-[2.5rem]">{weekday}</h1>
          <p className="truncate text-base font-semibold leading-tight text-muted sm:text-lg">
            {full}
            {date === today && <span className="text-leaf-deep"> · Today</span>}
          </p>
        </div>
        <IconButton
          label="Next day"
          icon={<ChevronRightIcon size={28} />}
          disabled={next > today}
          onClick={() => go(next)}
        />
      </div>

      {subjects.length > 0 && (
        <div className="ml-auto max-w-full">
          <SelectPill
            ariaLabel="Subject"
            value={String(subjectId)}
            onValueChange={(v) => onSubjectChange(Number(v))}
            options={subjects.map((s) => ({
              value: String(s.id),
              label: s.name,
              emoji: s.emoji,
              color: s.color,
              hint: startedSubjectIds.has(s.id) ? "Lesson started" : "Not started yet",
            }))}
          />
        </div>
      )}
    </header>
  );
}
