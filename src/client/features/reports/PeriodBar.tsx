import { periodLabel, periodRange, shiftPeriod, type Period } from "@shared/dates.ts";
import type { ISODate, Subject } from "@shared/types.ts";
import { ChevronLeftIcon, ChevronRightIcon } from "../../components/icons.tsx";
import { Button, Card, Chip, IconButton, SegmentedControl } from "../../components/ui/index.ts";
import type { ReportParams } from "./useReportParams.ts";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const NEXT_LABEL: Record<Period, string> = { day: "Next day", week: "Next week", month: "Next month" };
const PREV_LABEL: Record<Period, string> = { day: "Previous day", week: "Previous week", month: "Previous month" };
const NOW_LABEL: Record<Period, string> = { day: "Today", week: "This week", month: "This month" };

export interface PeriodBarProps {
  params: ReportParams;
  range: { from: ISODate; to: ISODate };
  schoolDays: readonly number[];
  today: ISODate;
  /** Subjects offered as filter chips, in order. */
  subjects: readonly Subject[];
}

/** Day | Week | Month, the ‹ period › navigator and the subject filter chips (spec §8.5). */
export function PeriodBar({ params, range, schoolDays, today, subjects }: PeriodBarProps) {
  const { period, date, subjectIds, set } = params;
  const nextDate = shiftPeriod(period, date, 1);
  const nextIsFuture = periodRange(period, nextDate, schoolDays).from > today;
  const showsToday = range.from <= today && today <= range.to;

  function toggleSubject(id: number) {
    const current = subjectIds ?? [];
    const next = subjectIds === undefined ? [id] : current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const everyOne = subjects.every((s) => next.includes(s.id));
    set({ subjectIds: next.length === 0 || everyOne ? undefined : next });
  }

  return (
    <Card data-print-hide className="flex flex-col gap-3 p-3! sm:p-4!">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SegmentedControl
          ariaLabel="Report period"
          value={period}
          onChange={(p) => set({ period: p })}
          options={PERIOD_OPTIONS}
        />
        {/*
          On a phone the navigator takes its own line (next to Day | Week | Month it ran off the screen),
          and "This week" drops below the ‹ label › when they don't all fit.
        */}
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-2 gap-y-2 sm:basis-auto">
          <IconButton
            label={PREV_LABEL[period]}
            icon={<ChevronLeftIcon size={28} />}
            onClick={() => set({ date: shiftPeriod(period, date, -1) })}
          />
          <p
            aria-live="polite"
            className="flex-auto whitespace-nowrap text-center font-display text-xl font-semibold text-forest tabular-nums sm:min-w-56 sm:flex-none sm:text-2xl"
          >
            {periodLabel(period, range)}
          </p>
          <IconButton
            label={NEXT_LABEL[period]}
            icon={<ChevronRightIcon size={28} />}
            disabled={nextIsFuture}
            onClick={() => set({ date: nextDate })}
          />
          {!showsToday && (
            <Button variant="ghost" className="ml-auto" onClick={() => set({ date: today })}>
              {NOW_LABEL[period]}
            </Button>
          )}
        </div>
      </div>

      {subjects.length > 1 && (
        <div role="group" aria-label="Subjects" className="flex flex-wrap gap-2">
          <Chip selected={subjectIds === undefined} onClick={() => set({ subjectIds: undefined })}>
            All subjects
          </Chip>
          {subjects.map((s) => (
            <Chip
              key={s.id}
              color={s.color}
              selected={subjectIds?.includes(s.id) ?? false}
              onClick={() => toggleSubject(s.id)}
            >
              <span aria-hidden="true">{s.emoji}</span>
              {s.name}
            </Chip>
          ))}
        </div>
      )}
    </Card>
  );
}
