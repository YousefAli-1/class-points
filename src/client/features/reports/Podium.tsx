import { motion } from "motion/react";
import { useEffect } from "react";
import type { ClassReport } from "@shared/report.ts";
import { formatPoints } from "@shared/rules.ts";
import type { Student } from "@shared/types.ts";
import { Mascot } from "../../components/Mascot.tsx";
import { Avatar, Card } from "../../components/ui/index.ts";
import { celebrate } from "../../lib/confetti.ts";
import { cx } from "../../lib/cx.ts";
import { firstShowing } from "./celebrateOnce.ts";

type Place = ClassReport["podium"][number];

const STYLE: Record<Place["place"], { medal: string; label: string; block: string; height: string }> = {
  1: { medal: "🥇", label: "1st", block: "bg-sunshine [--edge:var(--color-sunshine-deep)]", height: "h-28" },
  2: { medal: "🥈", label: "2nd", block: "bg-sprout [--edge:var(--color-leaf)]", height: "h-20" },
  3: { medal: "🥉", label: "3rd", block: "bg-mint-deep [--edge:var(--color-line-deep)]", height: "h-14" },
};

/** On the podium: 2nd on the left, 1st in the middle, 3rd on the right. */
const STAGE_ORDER = [2, 1, 3] as const;
/** Names shown per place before "and N more". */
const SHOW = 3;

export interface PodiumProps {
  podium: ClassReport["podium"];
  students: ReadonlyMap<number, Student>;
  /**
   * Identifies the report (period and filter): confetti plays the first time each one is shown in
   * this tab. `null` while the podium still shows the last period's report.
   */
  celebrateKey: string | null;
}

/** The top 3 by points; ties share a place (spec §8.5). Confetti on screen only, never in print. */
export function Podium({ podium, students, celebrateKey }: PodiumProps) {
  const hasWinners = podium.length > 0;

  useEffect(() => {
    if (!hasWinners || celebrateKey === null) return;
    const timer = setTimeout(() => {
      if (window.matchMedia?.("print").matches) return;
      // celebrate() itself does nothing when the device asks for reduced motion.
      if (firstShowing(celebrateKey)) celebrate("podium");
    }, 450);
    return () => clearTimeout(timer);
  }, [hasWinners, celebrateKey]);

  if (!hasWinners) return null;

  const byPlace = new Map(podium.map((p) => [p.place, p]));

  return (
    <Card data-print-flat className="flex h-full flex-col">
      <div className="flex items-center gap-3">
        <h2 className="text-[1.75rem]">Top of the class</h2>
        <Mascot mood="cheer" size={56} className="ml-auto shrink-0 print:hidden" />
      </div>

      <ol className="mt-4 grid flex-1 grid-cols-3 items-end gap-2 sm:gap-3" aria-label="Podium">
        {STAGE_ORDER.map((n, i) => {
          const place = byPlace.get(n);
          if (!place) return <li key={n} aria-hidden="true" />;
          return <Step key={n} place={place} students={students} delay={0.12 * (2 - i)} />;
        })}
      </ol>
    </Card>
  );
}

function Step({ place, students, delay }: { place: Place; students: ReadonlyMap<number, Student>; delay: number }) {
  const style = STYLE[place.place];
  const winners = place.studentIds.map((id) => students.get(id)).filter((s): s is Student => s !== undefined);
  const shown = winners.slice(0, SHOW);
  const more = winners.length - shown.length;

  return (
    <li className="flex min-w-0 flex-col items-center text-center">
      <span className="sr-only">
        {style.label} place, {formatPoints(place.points)} points: {winners.map((s) => s.name).join(", ")}
      </span>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.15, type: "spring", stiffness: 320, damping: 20 }}
        aria-hidden="true"
        className="flex w-full min-w-0 flex-col items-center gap-1 pb-2"
      >
        <div className="flex -space-x-3">
          {shown.map((s) => (
            <Avatar key={s.id} emoji={s.avatar} color={s.color} size={place.place === 1 ? "lg" : "md"} />
          ))}
        </div>
        <p className="line-clamp-2 w-full font-display text-xl font-semibold leading-tight text-ink [overflow-wrap:anywhere]">
          {shown.map((s) => s.name).join(", ")}
        </p>
        {more > 0 && <p className="text-base font-bold text-muted">and {more} more</p>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scaleY: 0.4 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ delay, type: "spring", stiffness: 260, damping: 22 }}
        style={{ transformOrigin: "bottom" }}
        aria-hidden="true"
        className={cx(
          "chunky-still flex w-full flex-col items-center justify-start gap-0.5 rounded-t-2xl pt-2",
          style.block,
          style.height,
        )}
      >
        <span aria-hidden="true" className="text-[1.75rem] leading-none">
          {style.medal}
        </span>
        <span className="rounded-full bg-white/85 px-2.5 font-display text-xl font-bold text-forest tabular-nums">
          {formatPoints(place.points)}
        </span>
      </motion.div>
    </li>
  );
}
