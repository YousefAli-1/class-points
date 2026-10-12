import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bootstrap, CalendarResponse, DayLesson, DayResponse } from "@shared/types.ts";
import { api } from "@client/lib/api.ts";
import { qk } from "@client/lib/queryKeys.ts";
import CalendarPage from "@client/features/calendar/CalendarPage.tsx";

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@client/lib/confetti.ts", () => ({ celebrate: vi.fn(), originOf: vi.fn() }));
vi.mock("@client/lib/sound.ts", () => ({ useSound: () => () => {}, playSound: () => {} }));

// Wednesday 14 October 2026, 9am. School runs Sunday to Thursday.
const TODAY = "2026-10-14";

function bootstrap(overrides: Partial<Bootstrap> = {}): Bootstrap {
  return {
    settings: {
      teacherName: "Ms Sara",
      className: "Class 2B",
      pointsClean: 1,
      pointsWarning: 0,
      pointsPenalty: -1,
      schoolDays: [0, 1, 2, 3, 4],
      soundOn: false,
      reportsNeedPin: false,
      lastBackupAt: null,
    },
    subjects: [
      { id: 1, name: "English", emoji: "📚", color: "sky", sortOrder: 2, archivedAt: null },
      { id: 2, name: "Mathematics", emoji: "🔢", color: "sunshine", sortOrder: 1, archivedAt: null },
      { id: 3, name: "Art", emoji: "🎨", color: "berry", sortOrder: 3, archivedAt: 1 },
    ],
    students: [],
    holidays: [{ id: 1, startDate: "2026-10-06", endDate: "2026-10-07", label: "Autumn break" }],
    ...overrides,
  };
}

function lesson(id: number, date: string, subjectId: number): DayLesson {
  return { id, date, subjectId, pointsClean: 1, pointsWarning: 0, pointsPenalty: -1, marks: {} };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderCalendar({
  boot = bootstrap(),
  calendar = { lessons: [] },
  day = { date: TODAY, lessons: [] },
  start = "/",
}: { boot?: Bootstrap; calendar?: CalendarResponse; day?: DayResponse; start?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(qk.bootstrap, boot);
  queryClient.setQueryData(qk.calendar("2026-10"), calendar);
  queryClient.setQueryData(qk.day(TODAY), day);
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <>
            <CalendarPage />
            <Where />
          </>
        ),
      },
      { path: "/day/:date", element: <Where /> },
    ],
    { initialEntries: [start] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

const cell = (date: string) => screen.getByTestId(`day-${date}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0, 0));
  toastMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CalendarPage", () => {
  it("renders today ring and holiday label", () => {
    renderCalendar();

    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    const today = cell(TODAY);
    expect(today.getAttribute("aria-current")).toBe("date");
    expect(today.getAttribute("data-today")).toBe("true");
    expect(within(today).getByText("Today")).toBeTruthy();
    expect(cell("2026-10-13").getAttribute("aria-current")).toBeNull();

    for (const date of ["2026-10-06", "2026-10-07"]) {
      expect(cell(date).getAttribute("data-kind")).toBe("holiday");
      expect(within(cell(date)).getByText("Autumn break")).toBeTruthy();
    }
    expect(cell("2026-10-08").getAttribute("data-kind")).toBe("school");
    expect(cell("2026-10-09").getAttribute("data-kind")).toBe("off"); // a Friday
  });

  it("future day click shows toast and does not navigate", () => {
    renderCalendar();

    fireEvent.click(cell("2026-10-20"));

    expect(toastMock).toHaveBeenCalledWith("That day hasn't come yet 🌱");
    expect(screen.getByTestId("where").textContent).toBe("/");
  });

  it("opens the day view when a past day is tapped", () => {
    renderCalendar();

    fireEvent.click(cell("2026-10-12"));

    expect(screen.getByTestId("where").textContent).toBe("/day/2026-10-12");
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("starts the week on the day after the weekend and dims days outside the month", () => {
    renderCalendar();

    const headers = screen.getAllByTestId("weekday").map((el) => el.textContent);
    expect(headers).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    // October 2026 starts on a Thursday, so the grid opens on Sunday 27 September.
    expect(cell("2026-09-27").getAttribute("data-outside")).toBe("true");
    expect(cell("2026-10-01").getAttribute("data-outside")).toBeNull();
  });

  it("shows one dot per started subject in subject order", () => {
    renderCalendar({
      calendar: {
        lessons: [
          { id: 1, date: "2026-10-12", subjectId: 1 },
          { id: 2, date: "2026-10-12", subjectId: 2 },
          { id: 3, date: "2026-10-12", subjectId: 3 },
          { id: 4, date: "2026-10-13", subjectId: 1 },
        ],
      },
    });

    const dots = within(cell("2026-10-12")).getAllByTestId("lesson-dot");
    expect(dots.map((d) => d.getAttribute("data-subject"))).toEqual(["Mathematics", "English", "Art"]);
    expect(within(cell("2026-10-13")).getAllByTestId("lesson-dot")).toHaveLength(1);
    expect(within(cell("2026-10-11")).queryAllByTestId("lesson-dot")).toHaveLength(0);
  });

  it("uses the month from the query string", () => {
    renderCalendar({ start: "/?month=2026-09" });

    expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
    expect(cell("2026-09-15").getAttribute("data-outside")).toBeNull();
  });
});

describe("Today panel", () => {
  it("lists active subjects in order with Start or Continue", () => {
    renderCalendar({ day: { date: TODAY, lessons: [lesson(7, TODAY, 1)] } });

    expect(screen.getByRole("heading", { name: "Good morning, Ms Sara!" })).toBeTruthy();
    const buttons = within(screen.getByRole("list", { name: "Today's subjects" })).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Start Mathematics", "Continue English"]);
  });

  it("Continue opens the started lesson", () => {
    const create = vi.spyOn(api, "createLesson");
    renderCalendar({ day: { date: TODAY, lessons: [lesson(7, TODAY, 1)] } });

    fireEvent.click(screen.getByRole("button", { name: "Continue English" }));

    expect(screen.getByTestId("where").textContent).toBe(`/day/${TODAY}?subject=1`);
    expect(create).not.toHaveBeenCalled();
  });

  it("Start creates the lesson, then opens it", async () => {
    const create = vi.spyOn(api, "createLesson").mockResolvedValue(lesson(9, TODAY, 2));
    const { queryClient } = renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Start Mathematics" }));

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(`/day/${TODAY}?subject=2`));
    expect(create).toHaveBeenCalledWith(TODAY, 2);
    expect(queryClient.getQueryData<DayResponse>(qk.day(TODAY))?.lessons.map((l) => l.id)).toEqual([9]);
  });

  it("asks first when today is a holiday", async () => {
    const create = vi.spyOn(api, "createLesson").mockResolvedValue(lesson(9, TODAY, 2));
    renderCalendar({
      boot: bootstrap({ holidays: [{ id: 2, startDate: TODAY, endDate: TODAY, label: "Sports day" }] }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Start Mathematics" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Sports day");
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Start lesson" }));

    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(`/day/${TODAY}?subject=2`));
    expect(create).toHaveBeenCalledWith(TODAY, 2);
  });
});
