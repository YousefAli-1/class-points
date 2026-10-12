import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router";
import { periodLabel, periodRange } from "@shared/dates.ts";
import { COLORS } from "@shared/palette.ts";
import { buildStudentReport, type Tally } from "@shared/report.ts";
import type { Bootstrap, Student, Subject } from "@shared/types.ts";
import { ArrowLeftIcon } from "../../components/icons.tsx";
import { Avatar, Card, EmptyState } from "../../components/ui/index.ts";
import { cx } from "../../lib/cx.ts";
import { useToday } from "../../lib/queries.ts";
import { PeriodBar } from "./PeriodBar.tsx";
import { PrintButton } from "./PrintButton.tsx";
import { PrintHeader } from "./PrintHeader.tsx";
import { ReportsGate } from "./ReportsGate.tsx";
import { PointsPill } from "./ReportTable.tsx";
import { entryParts, periodSubjects, sortSubjects } from "./reportUtils.ts";
import { ReportLoadError, ReportLoading } from "./ReportStatus.tsx";
import { StudentDayChart } from "./StudentDayChart.tsx";
import { useReportData } from "./useReportData.ts";
import { useReportParams } from "./useReportParams.ts";
import "./print.css";

/** One student's report (spec §8.5): total, a card per subject, points per day and the days with cards. */
export default function StudentReportPage() {
  const id = Number(useParams().id);
  const { search } = useLocation();

  return (
    <ReportsGate>
      {(boot) => {
        const student = boot.students.find((s) => s.id === id);
        if (!student) {
          return (
            <Card className="mt-4">
              <EmptyState
                mood="think"
                title="We couldn’t find that student"
                action={
                  <Link to={`/reports${search}`} className="font-display text-xl font-bold text-leaf-deep underline">
                    Back to the class report
                  </Link>
                }
              />
            </Card>
          );
        }
        return <StudentReportView boot={boot} student={student} />;
      }}
    </ReportsGate>
  );
}

function StudentReportView({ boot, student }: { boot: Bootstrap; student: Student }) {
  const { settings, subjects } = boot;
  const params = useReportParams();
  const today = useToday();
  const { search } = useLocation();
  const { period, date, subjectIds } = params;

  const range = periodRange(period, date, settings.schoolDays);
  const label = periodLabel(period, range);
  const raw = useReportData(range.from, range.to, true);

  const report = useMemo(
    () => (raw.data ? buildStudentReport({ lessons: raw.data.lessons, marks: raw.data.marks, student, subjectIds }) : null),
    [raw.data, student, subjectIds],
  );

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const { chipSubjects } = periodSubjects(subjects, raw.data?.lessons);
  const row = report?.row ?? null;
  const studentSubjects = row ? sortSubjects(subjects.filter((s) => row.bySubject[s.id])) : [];
  const notable = report?.entries.filter((e) => e.status !== "clean") ?? [];

  return (
    <section data-print="student" className="flex flex-col gap-4 pb-6">
      <PrintHeader className={settings.className} title={student.name} periodLabel={label} orientation="portrait" />

      <div data-print-hide className="flex items-center gap-3">
        <Link
          to={`/reports${search}`}
          className="chunky inline-flex min-h-14 items-center gap-2 rounded-btn border-2 border-line bg-white px-4 font-display text-xl font-bold text-forest [--edge:var(--color-line-deep)] hover:bg-sprout-soft"
        >
          <ArrowLeftIcon size={24} />
          Class report
        </Link>
        <PrintButton />
      </div>

      <PeriodBar params={params} range={range} schoolDays={settings.schoolDays} today={today} subjects={chipSubjects} />

      <Card data-print-flat className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Avatar emoji={student.avatar} color={student.color} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-4xl sm:text-5xl">{student.name}</h1>
          <p className="mt-1 text-lg font-bold text-muted">{label}</p>
        </div>
        {row && (
          <div className="flex flex-col items-center">
            <PointsPill points={row.points} className="px-5! py-1! text-5xl!" />
            <span className="mt-1 text-base font-bold text-muted">points</span>
          </div>
        )}
        {row && <TallyChips tally={row} attended={row.attended} className="w-full" />}
      </Card>

      {raw.error && !raw.data ? (
        <ReportLoadError onRetry={raw.retry} />
      ) : !report ? (
        <ReportLoading />
      ) : !row ? (
        <Card>
          <EmptyState mood="sleep" title="No lessons in this period yet">
            {student.name}’s report fills up as lessons are started on the day screen.
          </EmptyState>
        </Card>
      ) : (
        <div data-print-stack
          aria-busy={raw.stale || undefined} className={cx("flex flex-col gap-4 transition-opacity", raw.stale && "opacity-60")}>
          <ul aria-label="By subject" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {studentSubjects.map((s) => (
              <SubjectCard key={s.id} subject={s} tally={row.bySubject[s.id]} />
            ))}
          </ul>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <Card data-print-flat data-print-keep>
              <h2 className="mb-3 text-[1.75rem]">Points per day</h2>
              <StudentDayChart perDay={report.perDay} subjects={studentSubjects} />
            </Card>

            <Card data-print-flat>
              <h2 id="notable-title" className="text-[1.75rem]">
                Cards and absences
              </h2>
              {notable.length === 0 ? (
                <p className="mt-3 rounded-2xl bg-sprout-soft px-4 py-3 text-lg font-bold text-leaf-deep">
                  🌟 No cards and no absences. Super!
                </p>
              ) : (
                <ul aria-labelledby="notable-title" className="mt-2 flex flex-col">
                  {notable.map((entry) => {
                    const [day, subjectName, mark] = entryParts(entry, subjectById.get(entry.subjectId));
                    const subject = subjectById.get(entry.subjectId);
                    return (
                      <li
                        key={entry.lessonId}
                        className="flex min-h-12 flex-wrap items-center gap-x-2 border-t border-line py-2 text-lg first:border-t-0"
                      >
                        <span className="font-bold text-ink tabular-nums">{day}</span>
                        {" · "}
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="size-3 rounded-full"
                            style={{ backgroundColor: subject ? COLORS[subject.color].ring : undefined }}
                          />
                          {subjectName}
                        </span>
                        {" · "}
                        <span className="font-bold text-ink">{mark}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}

function SubjectCard({ subject, tally }: { subject: Subject; tally: Tally }) {
  const color = COLORS[subject.color];
  return (
    <li
      data-print-flat
      className="flex flex-col gap-2 rounded-card border-l-8 bg-white p-4 shadow-soft ring-1 ring-line/70"
      style={{ borderLeftColor: color.ring }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-2xl text-2xl"
          style={{ backgroundColor: color.bg }}
        >
          {subject.emoji}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-2xl">{subject.name}</h3>
        <PointsPill points={tally.points} />
      </div>
      <TallyChips tally={tally} attended={tally.lessons - tally.absences} small />
    </li>
  );
}

function TallyChips({ tally, attended, small = false, className }: { tally: Tally; attended: number; small?: boolean; className?: string }) {
  const items = [
    { emoji: "📚", text: `${attended} of ${tally.lessons} ${tally.lessons === 1 ? "lesson" : "lessons"}` },
    { emoji: "🟥", text: `${tally.warnings} ${tally.warnings === 1 ? "warning" : "warnings"}` },
    { emoji: "🟥🟥", text: `${tally.penalties} ${tally.penalties === 1 ? "penalty" : "penalties"}` },
    { emoji: "🏠", text: `${tally.absences} ${tally.absences === 1 ? "absence" : "absences"}` },
  ];
  return (
    <p className={cx("flex flex-wrap gap-2", className)}>
      {items.map((item) => (
        <span
          key={item.emoji}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full bg-mint px-3 font-bold text-ink",
            small ? "py-0.5 text-base" : "py-1 text-lg",
          )}
        >
          <span aria-hidden="true">{item.emoji}</span>
          {item.text}
        </span>
      ))}
    </p>
  );
}
