import { useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { COLORS } from "@shared/palette.ts";
import type { StudentRow } from "@shared/report.ts";
import { formatPoints } from "@shared/rules.ts";
import type { Student, Subject } from "@shared/types.ts";
import { Avatar, Card } from "../../components/ui/index.ts";
import { cx } from "../../lib/cx.ts";

type SortKey = "name" | "total" | "warnings" | "penalties" | "absences" | "attended" | `subject:${number}`;
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

export interface ReportTableProps {
  rows: readonly StudentRow[];
  students: ReadonlyMap<number, Student>;
  /** One column per subject, in order. */
  subjects: readonly Subject[];
  /** Link to a student's report (keeps the period and filter). */
  hrefFor(studentId: number): string;
  onOpen(studentId: number): void;
}

const STAT_COLUMNS: { key: SortKey; label: string; value(r: StudentRow): number }[] = [
  { key: "warnings", label: "Warnings", value: (r) => r.warnings },
  { key: "penalties", label: "Penalties", value: (r) => r.penalties },
  { key: "absences", label: "Absences", value: (r) => r.absences },
  { key: "attended", label: "Lessons attended", value: (r) => r.attended },
];

/** A points pill: green above zero, yellow at zero, coral below (as on the student tiles). */
export function PointsPill({ points, className }: { points: number; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex min-w-14 justify-center rounded-full px-3 py-0.5 font-display text-2xl font-bold tabular-nums",
        points > 0 && "bg-sprout-soft text-leaf-deep",
        points === 0 && "bg-sunshine-soft text-honey-deep",
        points < 0 && "bg-coral text-ink",
        className,
      )}
    >
      {formatPoints(points)}
    </span>
  );
}

/**
 * Student | a column per subject | Total | Warnings | Penalties | Absences | Lessons attended (spec §8.5).
 * Class order by default; a header tap sorts by it, a second tap flips it and a third goes back.
 */
export function ReportTable({ rows, students, subjects, hrefFor, onOpen }: ReportTableProps) {
  const [sort, setSort] = useState<Sort>(null);
  const nameOf = (id: number) => students.get(id)?.name ?? "";

  function valueOf(row: StudentRow, key: SortKey): number | string {
    if (key === "name") return nameOf(row.studentId);
    if (key === "total") return row.points;
    if (key.startsWith("subject:")) return row.bySubject[Number(key.slice(8))]?.points ?? Number.NEGATIVE_INFINITY;
    return STAT_COLUMNS.find((c) => c.key === key)?.value(row) ?? 0;
  }

  const sorted = sort
    ? [...rows].sort((a, b) => {
        const [x, y] = [valueOf(a, sort.key), valueOf(b, sort.key)];
        const order = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
        return (sort.dir === "asc" ? order : -order) || a.studentId - b.studentId;
      })
    : rows;

  function tap(key: SortKey) {
    const first = key === "name" ? "asc" : "desc";
    setSort((s) => (s?.key !== key ? { key, dir: first } : s.dir === first ? { key, dir: first === "asc" ? "desc" : "asc" } : null));
  }

  function openRow(e: MouseEvent, id: number) {
    if ((e.target as Element).closest("a")) return; // the name link navigates by itself
    onOpen(id);
  }

  const header = (key: SortKey, label: ReactNode, className?: string, swatch?: string) => {
    const active = sort?.key === key ? sort.dir : null;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
        className={cx("p-0 align-bottom", className)}
      >
        <button
          type="button"
          onClick={() => tap(key)}
          className={cx(
            "flex min-h-14 w-full items-end gap-1 rounded-xl px-2 pb-2 pt-1 text-base font-extrabold leading-tight print:min-h-0 print:pb-1",
            "text-muted hover:bg-mint hover:text-forest",
            key === "name" ? "justify-start text-left" : "justify-center text-center",
            active && "text-forest",
          )}
          style={swatch ? { boxShadow: `inset 0 -4px 0 0 ${swatch}` } : undefined}
        >
          <span>{label}</span>
          <span aria-hidden="true" className={cx("w-3 shrink-0 text-sm", !active && "opacity-0")}>
            {active === "asc" ? "▲" : "▼"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <Card data-print-flat className="p-2! sm:p-3! print:break-before-page">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-lg print:text-[15px] print:leading-5">
          <caption className="sr-only">Points per student. Tap a column title to sort, tap a student to open their report.</caption>
          <thead>
            <tr>
              {header("name", "Student", "sticky left-0 z-10 min-w-44 bg-white text-left")}
              {subjects.map((s) =>
                header(
                  `subject:${s.id}`,
                  <>
                    <span aria-hidden="true">{s.emoji} </span>
                    {s.name}
                  </>,
                  "min-w-24",
                  COLORS[s.color].ring,
                ),
              )}
              {header("total", "Total", "min-w-24")}
              {STAT_COLUMNS.map((c) => header(c.key, c.label, "min-w-24"))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const student = students.get(row.studentId);
              return (
                <tr
                  key={row.studentId}
                  onClick={(e) => openRow(e, row.studentId)}
                  className="group cursor-pointer break-inside-avoid"
                >
                  <th scope="row" className="sticky left-0 z-10 border-t border-line bg-white p-0 text-left font-normal group-hover:bg-mint">
                    <Link
                      to={hrefFor(row.studentId)}
                      className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1 font-display text-xl font-semibold text-ink print:min-h-0 print:py-0 print:text-[15px] print:leading-5"
                    >
                      {student && (
                        <span className="contents print:hidden">
                          <Avatar emoji={student.avatar} color={student.color} size="sm" />
                        </span>
                      )}
                      <span className="truncate">{student?.name}</span>
                    </Link>
                  </th>
                  {subjects.map((s) => {
                    const tally = row.bySubject[s.id];
                    return (
                      <td key={s.id} className="border-t border-line px-2 text-center font-bold tabular-nums group-hover:bg-mint">
                        {tally ? formatPoints(tally.points) : <span className="text-muted">–</span>}
                      </td>
                    );
                  })}
                  <td className="border-t border-line px-2 text-center group-hover:bg-mint">
                    <PointsPill points={row.points} className="print:py-0 print:text-[15px] print:leading-5" />
                  </td>
                  {STAT_COLUMNS.map((c) => (
                    <td key={c.key} className="border-t border-line px-2 text-center font-bold tabular-nums group-hover:bg-mint">
                      {c.value(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
