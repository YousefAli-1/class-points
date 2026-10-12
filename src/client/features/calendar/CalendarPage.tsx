import { AnimatePresence, motion, type Variants } from "motion/react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { monthOf, periodLabel, shiftPeriod, weekStartDay } from "@shared/dates.ts";
import type { ISODate } from "@shared/types.ts";
import { ChevronLeftIcon, ChevronRightIcon } from "../../components/icons.tsx";
import { Mascot } from "../../components/Mascot.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";
import { IconButton } from "../../components/ui/IconButton.tsx";
import { Spinner } from "../../components/ui/Spinner.tsx";
import { useBootstrap, useCalendar, useToday } from "../../lib/queries.ts";
import { MonthGrid } from "./MonthGrid.tsx";
import { TodayPanel } from "./TodayPanel.tsx";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const EMPTY_LESSONS: never[] = [];

// The month slides in from the side it was asked for. With reduced motion (MotionConfig "user")
// Motion skips the movement and only the fade plays.
const slide: Variants = {
  enter: (direction: number) => ({ x: `${direction * 36}%`, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: `${direction * -36}%`, opacity: 0 }),
};

function shiftMonth(month: string, delta: number): string {
  return monthOf(shiftPeriod("month", `${month}-01`, delta));
}

/** Which way the month moved since the last render: 1 forward, -1 back. */
function useDirection(month: string): number {
  const [state, setState] = useState({ month, direction: 1 });
  if (state.month !== month) {
    const next = { month, direction: month > state.month ? 1 : -1 };
    setState(next);
    return next.direction;
  }
  return state.direction;
}

/** Home: the greeting with today's subjects and the month calendar (spec §8.3). Route `/?month=YYYY-MM`. */
export default function CalendarPage() {
  const navigate = useNavigate();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const asked = params.get("month");
  const month = asked && MONTH.test(asked) ? asked : monthOf(today);
  const direction = useDirection(month);

  const bootstrap = useBootstrap();
  const lessons = useCalendar(month).data?.lessons ?? EMPTY_LESSONS;

  function goTo(next: string) {
    setParams(next === monthOf(today) ? {} : { month: next }, { replace: true });
  }

  function pick(date: ISODate) {
    if (date > today) {
      toast("That day hasn't come yet 🌱");
      return;
    }
    void navigate(`/day/${date}`);
  }

  const boot = bootstrap.data;
  if (!boot) {
    return (
      <Card className="mx-auto mt-6 max-w-xl">
        {bootstrap.isError ? (
          <EmptyState
            mood="think"
            title="Couldn't load your class"
            action={<Button onClick={() => void bootstrap.refetch()}>Try again</Button>}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-leaf-deep">
            <Mascot mood="think" size={96} />
            <Spinner size={30} />
          </div>
        )}
      </Card>
    );
  }

  const { schoolDays } = boot.settings;
  const title = periodLabel("month", { from: `${month}-01`, to: `${month}-01` });

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <TodayPanel today={today} boot={boot} className="lg:order-last" />

      <Card className="flex min-w-0 flex-col gap-3 p-3! sm:p-5! lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 aria-live="polite" className="w-full min-w-0 truncate pl-1 text-[1.75rem] sm:w-auto sm:flex-1 sm:text-[2rem]">
            {title}
          </h2>
          <Button variant="secondary" onClick={() => goTo(monthOf(today))} className="px-4! sm:px-5!">
            Today
          </Button>
          <IconButton label="Previous month" icon={<ChevronLeftIcon size={28} />} onClick={() => goTo(shiftMonth(month, -1))} />
          <IconButton label="Next month" icon={<ChevronRightIcon size={28} />} onClick={() => goTo(shiftMonth(month, 1))} />
        </div>

        <div className="relative -mx-1 overflow-hidden px-1 pt-1.5 pb-1">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.div
              key={month}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: { type: "spring", stiffness: 420, damping: 38 }, opacity: { duration: 0.18 } }}
            >
              <MonthGrid
                month={month}
                weekStart={weekStartDay(schoolDays)}
                today={today}
                schoolDays={schoolDays}
                holidays={boot.holidays}
                subjects={boot.subjects}
                lessons={lessons}
                onPick={pick}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}
