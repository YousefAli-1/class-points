import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayISO } from "@shared/dates.ts";
import { buildClassReport } from "@shared/report.ts";
import { formatPoints } from "@shared/rules.ts";
import type { AuthStatus, Bootstrap, ReportRaw } from "@shared/types.ts";
import ReportsPage from "@client/features/reports/ReportsPage.tsx";
import StudentReportPage from "@client/features/reports/StudentReportPage.tsx";
import { periodSubjects } from "@client/features/reports/reportUtils.ts";
import { useReportParams } from "@client/features/reports/useReportParams.ts";
import { qk } from "@client/lib/queryKeys.ts";

// jsdom has no canvas: keep the podium confetti out of the tests.
vi.mock("@client/lib/confetti.ts", () => ({ celebrate: vi.fn(), originOf: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>(async () => {
  throw new Error("no network in tests");
});

const LOGGED_IN: AuthStatus = { setupDone: true, loggedIn: true, adminUnlocked: false, adminUntil: null };

function bootstrap(overrides: Partial<Bootstrap["settings"]> = {}): Bootstrap {
  return {
    settings: {
      teacherName: "Ms Lee",
      className: "Class 2B",
      schoolDays: [0, 1, 2, 3, 4],
      soundOn: false,
      reportsNeedPin: false,
      lastBackupAt: null,
      pointsClean: 1,
      pointsWarning: 0,
      pointsPenalty: -1,
      ...overrides,
    },
    subjects: [
      { id: 1, name: "English", emoji: "📚", color: "sky", sortOrder: 0, archivedAt: null },
      { id: 2, name: "Mathematics", emoji: "🔢", color: "sunshine", sortOrder: 1, archivedAt: null },
    ],
    students: [
      { id: 1, name: "Ada", avatar: "🦊", color: "leaf", sortOrder: 1, activeFrom: "2026-09-01", archivedAt: null },
      { id: 2, name: "Ben", avatar: "🐼", color: "sky", sortOrder: 0, activeFrom: "2026-09-01", archivedAt: null },
      { id: 3, name: "Cy", avatar: "🐸", color: "grape", sortOrder: 2, activeFrom: "2026-09-01", archivedAt: null },
    ],
    holidays: [],
  };
}

// Sun 11 Oct 2026 starts a Sun–Thu school week: 11–17 Oct.
const WEEK = { from: "2026-10-11", to: "2026-10-17" };
const POINTS = { pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 };

const RAW: ReportRaw = {
  lessons: [
    { id: 1, date: "2026-10-11", subjectId: 1, ...POINTS },
    { id: 2, date: "2026-10-12", subjectId: 2, ...POINTS, pointsClean: 2 },
    { id: 3, date: "2026-10-13", subjectId: 1, ...POINTS },
  ],
  marks: [
    { lessonId: 1, studentId: 1, status: "warning", updatedAt: 1 },
    { lessonId: 2, studentId: 1, status: "penalty", updatedAt: 1 },
    { lessonId: 3, studentId: 2, status: "absent", updatedAt: 1 },
    { lessonId: 3, studentId: 3, status: "penalty", updatedAt: 1 },
  ],
};

/** A row's student name, without the avatar emoji. */
const nameIn = (row: Element) => row.querySelector("th")?.textContent?.replace(/\p{Extended_Pictographic}/gu, "");

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderAt(
  url: string,
  { boot = bootstrap(), auth = LOGGED_IN, raw = RAW }: { boot?: Bootstrap; auth?: AuthStatus; raw?: ReportRaw | null } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.auth, auth);
  qc.setQueryData(qk.bootstrap, boot);
  if (raw) qc.setQueryData(qk.report(WEEK.from, WEEK.to), raw);
  const router = createMemoryRouter(
    [
      { path: "/reports", element: <ReportsPage /> },
      {
        path: "/reports/student/:id",
        element: (
          <>
            <StudentReportPage />
            <Where />
          </>
        ),
      },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

describe("useReportParams", () => {
  function Probe() {
    const p = useReportParams();
    return (
      <>
        <p data-testid="params">{JSON.stringify({ period: p.period, date: p.date, subjectIds: p.subjectIds ?? null })}</p>
        <button onClick={() => p.set({ period: "month", subjectIds: [2, 1] })}>month</button>
        <button onClick={() => p.set({ subjectIds: undefined })}>all</button>
        <Where />
      </>
    );
  }

  function renderProbe(url: string) {
    const router = createMemoryRouter([{ path: "/reports", element: <Probe /> }], { initialEntries: [url] });
    render(<RouterProvider router={router} />);
  }

  const params = () => JSON.parse(screen.getByTestId("params").textContent ?? "");

  it("week params default", () => {
    renderProbe("/reports");

    expect(params()).toEqual({ period: "week", date: todayISO(), subjectIds: null });
  });

  it("reads and writes period, date and subjects in the URL", () => {
    renderProbe("/reports?period=day&date=2026-10-12&subjects=3");
    expect(params()).toEqual({ period: "day", date: "2026-10-12", subjectIds: [3] });

    fireEvent.click(screen.getByRole("button", { name: "month" }));
    expect(params()).toEqual({ period: "month", date: "2026-10-12", subjectIds: [1, 2] });
    expect(screen.getByTestId("where").textContent).toBe("/reports?period=month&date=2026-10-12&subjects=1%2C2");

    fireEvent.click(screen.getByRole("button", { name: "all" }));
    expect(params().subjectIds).toBeNull();
  });

  it("falls back to the defaults for nonsense values", () => {
    renderProbe("/reports?period=year&date=2026-02-30&subjects=x,,-1");

    expect(params()).toEqual({ period: "week", date: todayISO(), subjectIds: null });
  });
});

describe("ReportsPage", () => {
  it("table totals match buildClassReport", () => {
    renderAt("/reports?date=2026-10-11");

    const report = buildClassReport({ ...RAW, students: bootstrap().students });
    const table = screen.getByRole("table");
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent ?? "");
    const totalCol = headers.findIndex((h) => h.startsWith("Total"));
    expect(totalCol).toBeGreaterThan(0);

    const bodyRows = within(table).getAllByRole("row").slice(1);
    // Class order (sortOrder) by default: Ben, Ada, Cy.
    expect(bodyRows.map(nameIn)).toEqual(["Ben", "Ada", "Cy"]);
    for (const [i, row] of report.rows.entries()) {
      const cells = bodyRows[i].querySelectorAll("th, td");
      expect(cells[totalCol].textContent).toBe(formatPoints(row.points));
    }
    expect(report.rows.map((r) => formatPoints(r.points))).toEqual(["+3", "0", "+2"]);
  });

  it("sorts by a column when its header is tapped", () => {
    renderAt("/reports?date=2026-10-11");

    fireEvent.click(screen.getByRole("button", { name: /^Total/ }));

    const names = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map(nameIn);
    expect(names).toEqual(["Ben", "Cy", "Ada"]);
  });

  it("opens the student report with the same params when a row is tapped", () => {
    renderAt("/reports?date=2026-10-11");

    fireEvent.click(screen.getByRole("row", { name: /Ada/ }));

    expect(screen.getByTestId("where").textContent).toBe("/reports/student/1?date=2026-10-11");
  });

  it("locked when reportsNeedPin", () => {
    renderAt("/reports?date=2026-10-11", { boot: bootstrap({ reportsNeedPin: true }), raw: null });

    expect(screen.getByRole("heading", { name: "Reports are locked" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is open with reportsNeedPin once admin is unlocked", () => {
    renderAt("/reports?date=2026-10-11", {
      boot: bootstrap({ reportsNeedPin: true }),
      auth: { ...LOGGED_IN, adminUnlocked: true, adminUntil: Date.now() + 600_000 },
    });

    expect(screen.queryByRole("heading", { name: "Reports are locked" })).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("empty state when no lessons", () => {
    renderAt("/reports?date=2026-10-11", { raw: { lessons: [], marks: [] } });

    expect(screen.getByRole("heading", { name: "No lessons in this period yet" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("StudentReportPage", () => {
  it("lists only the days with a card or an absence", () => {
    renderAt("/reports/student/1?date=2026-10-11");

    const items = within(screen.getByRole("list", { name: /cards and absences/i }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual(["Sun 11 Oct · English · 🟥 Warning", "Mon 12 Oct · Mathematics · 🟥🟥 Penalty"]);
    expect(screen.getByRole("heading", { name: "Ada" })).toBeTruthy();
  });

  it("is locked by the same PIN rule as the class report", () => {
    renderAt("/reports/student/1?date=2026-10-11", { boot: bootstrap({ reportsNeedPin: true }), raw: null });

    expect(screen.getByRole("heading", { name: "Reports are locked" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ada" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("periodSubjects", () => {
  it("offers current subjects plus removed ones still taught in the period, in admin order", () => {
    const subjects = [
      ...bootstrap().subjects,
      { id: 3, name: "Art", emoji: "🎨", color: "grape" as const, sortOrder: -1, archivedAt: 1_790_000_000_000 },
      { id: 4, name: "Music", emoji: "🎵", color: "coral" as const, sortOrder: 5, archivedAt: 1_790_000_000_000 },
    ];

    const { taught, chipSubjects } = periodSubjects(subjects, [{ subjectId: 3 }, { subjectId: 1 }]);

    expect([...taught].sort()).toEqual([1, 3]);
    expect(chipSubjects.map((s) => s.name)).toEqual(["Art", "English", "Mathematics"]);
    expect(periodSubjects(subjects, undefined).chipSubjects.map((s) => s.name)).toEqual(["English", "Mathematics"]);
  });
});
