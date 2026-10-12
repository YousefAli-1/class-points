import type { ClassReport } from "@shared/report.ts";
import { formatPoints } from "@shared/rules.ts";
import { cx } from "../../lib/cx.ts";

interface Stat {
  emoji: string;
  label: string;
  value: string;
  tint: string;
}

/**
 * Five tiles: stars earned, lessons held, warnings, penalties and absences (spec §8.5).
 * `beside`: two columns on wide screens, to sit next to the podium.
 */
export function SummaryCards({ report, beside = false }: { report: ClassReport; beside?: boolean }) {
  const { totals } = report;
  const stats: Stat[] = [
    {
      emoji: "⭐",
      label: "Stars earned",
      value: totals.points < 0 ? formatPoints(totals.points) : String(totals.points),
      tint: "bg-sunshine-soft",
    },
    { emoji: "📚", label: "Lessons held", value: String(report.lessonsHeld), tint: "bg-sprout-soft" },
    { emoji: "🟥", label: "Warnings", value: String(totals.warnings), tint: "bg-card-red-soft" },
    { emoji: "🟥🟥", label: "Penalties", value: String(totals.penalties), tint: "bg-card-red-soft" },
    { emoji: "🏠", label: "Absences", value: String(totals.absences), tint: "bg-mist" },
  ];

  return (
    <ul
      aria-label="Summary"
      className={cx(
        "grid grid-cols-2 content-start gap-3 sm:grid-cols-3",
        beside ? "lg:grid-cols-2 print:grid-cols-2" : "lg:grid-cols-5 print:grid-cols-5",
      )}
    >
      {stats.map((s, i) => (
        <li
          key={s.label}
          data-print-flat
          className={cx(
            "flex items-center gap-3 rounded-card bg-white p-3 shadow-soft ring-1 ring-line/70 sm:p-4",
            i === 0 && "col-span-2 sm:col-span-1",
            i === 0 && beside && "lg:col-span-2 print:col-span-2",
          )}
        >
          <span
            aria-hidden="true"
            className={cx("flex size-14 shrink-0 items-center justify-center rounded-2xl text-[1.75rem] leading-none", s.tint)}
          >
            <span className={s.emoji.length > 2 ? "-space-x-1 text-xl" : undefined}>{s.emoji}</span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-[2.5rem] font-semibold leading-none text-forest tabular-nums">{s.value}</span>
            <span className="mt-1 text-base font-bold leading-tight text-muted">{s.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
