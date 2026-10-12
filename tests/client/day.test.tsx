import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bootstrap, DayResponse, MarkStatus, Student } from "@shared/types.ts";
import DayPage from "@client/features/day/DayPage.tsx";
import { withMarks } from "@client/lib/dayCache.ts";
import { qk } from "@client/lib/queryKeys.ts";
import { SaveQueueContext, type SaveQueueStore } from "@client/lib/saveQueueContext.ts";

const play = vi.fn();
vi.mock("@client/lib/sound.ts", () => ({ useSound: () => play }));
vi.mock("@client/lib/confetti.ts", () => ({ celebrate: vi.fn(), originOf: () => ({ x: 0, y: 0 }) }));

const DAY = "2026-10-11"; // a Sunday, a school day below
const TODAY = new Date(2026, 9, 12, 9, 0);

function student(id: number, name: string, extra: Partial<Student> = {}): Student {
  return { id, name, avatar: "🦊", color: "leaf", sortOrder: id, activeFrom: "2026-09-01", archivedAt: null, ...extra };
}

const bootstrap: Bootstrap = {
  settings: {
    teacherName: "Ms Green",
    className: "Class 2B",
    pointsClean: 1,
    pointsWarning: 0,
    pointsPenalty: -1,
    schoolDays: [0, 1, 2, 3, 4],
    soundOn: true,
    reportsNeedPin: false,
    lastBackupAt: null,
  },
  subjects: [
    { id: 1, name: "English", emoji: "📚", color: "sky", sortOrder: 0, archivedAt: null },
    { id: 2, name: "Mathematics", emoji: "🔢", color: "sunshine", sortOrder: 1, archivedAt: null },
  ],
  students: [
    student(2, "Bea"),
    student(1, "Ali"),
    student(3, "Newcomer", { activeFrom: "2026-10-12" }),
    student(4, "Moved Away", { archivedAt: "2026-10-01" }),
  ],
  holidays: [],
};

const startedDay: DayResponse = {
  date: DAY,
  lessons: [
    { id: 7, date: DAY, subjectId: 1, pointsClean: 1, pointsWarning: 0, pointsPenalty: -1, marks: {} },
  ],
};

/** A save queue that records taps and, like the real one, writes them into the cached day. */
function fakeStore(qc: QueryClient) {
  const enqueueMark = vi.fn((date: string, lessonId: number, studentId: number, status: MarkStatus) => {
    qc.setQueryData<DayResponse>(
      qk.day(date),
      (day) => day && withMarks(day, [{ lessonId, studentId, status, updatedAt: Date.now() }]),
    );
  });
  const snapshot = { state: "saved" as const, size: 0, entries: [] };
  const store: SaveQueueStore = {
    queue: {} as SaveQueueStore["queue"],
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    refresh: () => {},
    enqueueMark,
    retryNow: () => {},
  };
  return { store, enqueueMark };
}

function renderDay(day: DayResponse, path = `/day/${DAY}`) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.bootstrap, bootstrap);
  qc.setQueryData(qk.day(DAY), day);
  const { store, enqueueMark } = fakeStore(qc);
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>calendar home</p> },
      { path: "/day/:date", element: <DayPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={qc}>
      <SaveQueueContext.Provider value={store}>
        <RouterProvider router={router} />
      </SaveQueueContext.Provider>
    </QueryClientProvider>,
  );
  return { qc, enqueueMark, router };
}

const tileOf = (name: string) => screen.getByRole("group", { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  // Nothing in these tests should reach the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  play.mockReset();
});

describe("Day view", () => {
  it("penalty without warning shows hint and does not enqueue", async () => {
    const { enqueueMark } = renderDay(startedDay);
    fireEvent.click(await screen.findByRole("button", { name: "Penalty for Ali" }));

    expect(await within(tileOf("Ali")).findByText("Give a warning first")).toBeTruthy();
    expect(enqueueMark).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledWith("nope");
    expect(screen.getByRole("button", { name: "Penalty for Ali" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("warning then penalty enqueues penalty and badge shows −1", async () => {
    const { enqueueMark } = renderDay(startedDay);
    fireEvent.click(await screen.findByRole("button", { name: "Warning for Ali" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Warning for Ali" }).getAttribute("aria-pressed")).toBe("true"),
    );
    expect(enqueueMark).toHaveBeenLastCalledWith(DAY, 7, 1, "warning");
    expect(play).toHaveBeenLastCalledWith("boop");
    expect(within(tileOf("Ali")).getByText("0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Penalty for Ali" }));
    await waitFor(() => expect(within(tileOf("Ali")).getByText("−1")).toBeTruthy());
    expect(enqueueMark).toHaveBeenLastCalledWith(DAY, 7, 1, "penalty");
    expect(screen.getByRole("button", { name: "Penalty for Ali" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("removing warning clears penalty (badge +1)", async () => {
    const { enqueueMark } = renderDay({
      ...startedDay,
      lessons: [{ ...startedDay.lessons[0], marks: { 1: { status: "penalty", updatedAt: 1 } } }],
    });
    expect(await within(tileOf("Ali")).findByText("−1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Warning for Ali" }));
    await waitFor(() => expect(within(tileOf("Ali")).getByText("+1")).toBeTruthy());
    expect(enqueueMark).toHaveBeenLastCalledWith(DAY, 7, 1, "clean");
    expect(play).toHaveBeenLastCalledWith("sparkle");
    expect(screen.getByRole("button", { name: "Warning for Ali" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Penalty for Ali" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("absent dims tile and disables cards", async () => {
    const { enqueueMark } = renderDay(startedDay);
    fireEvent.click(await screen.findByRole("button", { name: "Mark Ali absent" }));

    await waitFor(() => expect(tileOf("Ali").dataset.status).toBe("absent"));
    expect(enqueueMark).toHaveBeenLastCalledWith(DAY, 7, 1, "absent");
    expect(play).toHaveBeenLastCalledWith("whoosh");
    expect(within(tileOf("Ali")).getByText("Absent")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Warning for Ali" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Penalty for Ali" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Mark Ali present" }));
    await waitFor(() => expect(tileOf("Ali").dataset.status).toBe("clean"));
    expect(play).toHaveBeenLastCalledWith("pop");
    expect(screen.getByRole("button", { name: "Warning for Ali" })).toHaveProperty("disabled", false);
  });

  it("not-started subject shows Start button", async () => {
    renderDay(startedDay, `/day/${DAY}?subject=2`);
    expect(await screen.findByRole("button", { name: /Start Mathematics lesson/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Warning for Ali" })).toBeNull();
  });

  it("ineligible students hidden", async () => {
    renderDay(startedDay);
    const names = (await screen.findAllByRole("group")).map((g) => g.getAttribute("aria-label"));
    expect(names).toEqual(["Ali", "Bea"]);
    expect(screen.queryByText("Newcomer")).toBeNull();
    expect(screen.queryByText("Moved Away")).toBeNull();
  });

  it("defaults to the first subject with a lesson that day", async () => {
    renderDay({ ...startedDay, lessons: [{ ...startedDay.lessons[0], subjectId: 2 }] });
    expect(await screen.findByRole("button", { name: "Warning for Ali" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Subject" }).textContent).toContain("Mathematics");
  });

  it("a lesson on a day before the class counts can still be cancelled", async () => {
    const early = "2026-08-30"; // before everyone's activeFrom
    const { qc } = renderDay(startedDay, `/day/${early}`);
    qc.setQueryData<DayResponse>(qk.day(early), {
      date: early,
      lessons: [{ ...startedDay.lessons[0], id: 9, date: early }],
    });

    expect(await screen.findByText("No students on this day")).toBeTruthy();
    expect(screen.getByRole("button", { name: "More lesson options" })).toBeTruthy();
  });

  it("cancelling the lesson a day opened on stays on that subject", async () => {
    // Opened from the calendar: no ?subject, so the day shows its first started lesson, Mathematics.
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
    renderDay({ ...startedDay, lessons: [{ ...startedDay.lessons[0], subjectId: 2 }] });
    expect(await screen.findByRole("button", { name: "Warning for Ali" })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("button", { name: "More lesson options" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Cancel this lesson/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, cancel it" }));

    expect(await screen.findByRole("button", { name: /Start Mathematics lesson/ })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Subject" }).textContent).toContain("Mathematics");
  });

  it("redirects future dates home", async () => {
    renderDay(startedDay, "/day/2026-10-13");
    expect(await screen.findByText("calendar home")).toBeTruthy();
  });
});
