import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { periodLabel, periodRange } from "@shared/dates.ts";
import { buildClassReport } from "@shared/report.ts";
import type { Bootstrap, Student } from "@shared/types.ts";
import { PinGate } from "../../components/PinGate.tsx";
import { Button, Card, EmptyState } from "../../components/ui/index.ts";
import { cx } from "../../lib/cx.ts";
import { useAuthStatus, useBootstrap, useToday } from "../../lib/queries.ts";
import { PeriodBar } from "./PeriodBar.tsx";
import { Podium } from "./Podium.tsx";
import { PointsChart } from "./PointsChart.tsx";
import { PrintHeader } from "./PrintHeader.tsx";
import { sortSubjects } from "./reportUtils.ts";
import { ReportLoadError, ReportLoading } from "./ReportStatus.tsx";
import { ReportTable } from "./ReportTable.tsx";
import { SummaryCards } from "./SummaryCards.tsx";
import { useReportData } from "./useReportData.ts";
import { useReportParams } from "./useReportParams.ts";
import "./print.css";

/** The class report (spec §8.5): period and subject filter, summary, podium, chart and table. */
export default function ReportsPage() {
  const auth = useAuthStatus();
  const boot = useBootstrap();

  if (!auth.data || !boot.data) {
    return boot.isError ? <ReportLoadError onRetry={() => void boot.refetch()} /> : <ReportLoading />;
  }
  if (boot.data.settings.reportsNeedPin && !auth.data.adminUnlocked) {
    return (
      <section className="flex flex-col gap-4 pt-4">
        <PinGate title="Reports are locked" subtitle="Enter your PIN to see the reports" />
      </section>
    );
  }
  return <ClassReportView boot={boot.data} />;
}

function ClassReportView({ boot }: { boot: Bootstrap }) {
  const { settings, subjects, students } = boot;
  const params = useReportParams();
  const today = useToday();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { period, date, subjectIds } = params;

  const range = periodRange(period, date, settings.schoolDays);
  const label = periodLabel(period, range);
  const raw = useReportData(range.from, range.to, true);

  const studentById = useMemo(() => new Map<number, Student>(students.map((s) => [s.id, s])), [students]);
  const report = useMemo(
    () => (raw.data ? buildClassReport({ lessons: raw.data.lessons, marks: raw.data.marks, students, subjectIds }) : null),
    [raw.data, students, subjectIds],
  );

  // Filter chips: current subjects, plus removed ones that still have lessons in this period.
  const taught = new Set(raw.data?.lessons.map((l) => l.subjectId));
  const chipSubjects = sortSubjects(subjects.filter((s) => s.archivedAt === null || taught.has(s.id)));
  // Table columns: the subjects in the filter that had a lesson in this period.
  const columns = chipSubjects.filter((s) => taught.has(s.id) && (!subjectIds || subjectIds.includes(s.id)));

  const studentHref = (id: number) => `/reports/student/${id}${search}`;
  const celebrateKey = `${range.from}|${range.to}|${subjectIds?.join(",") ?? "all"}`;

  return (
    <section data-print="class" className="flex flex-col gap-4 pb-6">
      <PrintHeader className={settings.className} periodLabel={label} orientation="landscape" />

      <div data-print-hide className="flex items-center gap-3">
        <h1 className="text-4xl">Reports</h1>
        <Button variant="secondary" icon={<span aria-hidden="true">🖨️</span>} className="ml-auto" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <PeriodBar params={params} range={range} schoolDays={settings.schoolDays} today={today} subjects={chipSubjects} />

      {raw.error && !raw.data ? (
        <ReportLoadError onRetry={raw.retry} />
      ) : !report ? (
        <ReportLoading />
      ) : report.lessonsHeld === 0 ? (
        <Card>
          <EmptyState mood="sleep" title="No lessons in this period yet">
            Reports fill up as lessons are started on the day screen.
          </EmptyState>
        </Card>
      ) : (
        <div
          data-print-stack
          aria-busy={raw.stale || undefined}
          className={cx("flex flex-col gap-4 transition-opacity", raw.stale && "opacity-60")}
        >
          {report.podium.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <SummaryCards report={report} beside />
              <Podium podium={report.podium} students={studentById} celebrateKey={celebrateKey} />
            </div>
          ) : (
            <SummaryCards report={report} />
          )}
          <PointsChart
            rows={report.rows.map((r) => ({ id: r.studentId, name: studentById.get(r.studentId)?.name ?? "", points: r.points }))}
          />
          <ReportTable
            rows={report.rows}
            students={studentById}
            subjects={columns}
            hrefFor={studentHref}
            onOpen={(id) => void navigate(studentHref(id))}
          />
        </div>
      )}
    </section>
  );
}
