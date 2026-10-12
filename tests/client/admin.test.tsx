import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayISO } from "@shared/dates.ts";
import type { AuthStatus, Bootstrap } from "@shared/types.ts";
import { AddStudentsDialog } from "@client/features/admin/AddStudentsDialog.tsx";
import AdminPage from "@client/features/admin/AdminPage.tsx";
import { PointsTab } from "@client/features/admin/PointsTab.tsx";
import { useAutosaveField } from "@client/features/admin/useAutosaveField.ts";
import { qk } from "@client/lib/queryKeys.ts";

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const BOOT: Bootstrap = {
  settings: {
    teacherName: "Ms Rana",
    className: "Class 2B",
    pointsClean: 1,
    pointsWarning: 0,
    pointsPenalty: -1,
    schoolDays: [0, 1, 2, 3, 4],
    soundOn: true,
    reportsNeedPin: false,
    lastBackupAt: null,
  },
  subjects: [{ id: 1, name: "English", emoji: "📚", color: "sky", sortOrder: 0, archivedAt: null }],
  students: [],
  holidays: [],
};

function authStatus(adminUnlocked: boolean): AuthStatus {
  return { setupDone: true, loggedIn: true, adminUnlocked, adminUntil: adminUnlocked ? Date.now() + 600_000 : null };
}

function renderWith(ui: ReactNode, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  return qc;
}

/** The parsed JSON bodies of requests sent with `method` to `path`. */
function bodiesOf(method: string, path: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url) === path && (init?.method ?? "GET") === method)
    .map(([, init]) => JSON.parse(String(init?.body)));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AdminPage", () => {
  it("shows PinGate when locked", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === "/api/auth/status") return json(authStatus(false));
      return json(BOOT);
    });

    renderWith(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin/*" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Teacher's corner" })).toBeTruthy();
    expect(screen.getByText("Enter your PIN")).toBeTruthy();
    expect(screen.queryByText(/Unlocked/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Students/ })).toBeNull();
  });

  it("shows the tabs with a Lock button when unlocked, and locking brings the gate back", async () => {
    let unlocked = true;
    fetchMock.mockImplementation(async (url, init) => {
      const path = String(url);
      if (path === "/api/auth/status") return json(authStatus(unlocked));
      if (path === "/api/auth/lock" && init?.method === "POST") {
        unlocked = false;
        return json({ ok: true });
      }
      return json(BOOT);
    });

    renderWith(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin/*" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Unlocked/)).toBeTruthy();
    // /admin opens the Students tab.
    await waitFor(() => expect(screen.getByRole("link", { name: /Students/ }).getAttribute("aria-current")).toBe("page"));
    expect(await screen.findByRole("heading", { name: "Students" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));

    expect(await screen.findByText("Enter your PIN")).toBeTruthy();
    expect(screen.queryByText(/Unlocked/)).toBeNull();
    expect(bodiesOf("POST", "/api/auth/lock")).toHaveLength(1);
  });
});

describe("PointsTab", () => {
  it("points tab blocks invalid ordering", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "PATCH") return json({ ...BOOT.settings, ...JSON.parse(String(init.body)) });
      if (String(url) === "/api/auth/status") return json(authStatus(true));
      return json(BOOT);
    });
    renderWith(<PointsTab />, (qc) => qc.setQueryData(qk.bootstrap, BOOT));

    // No cards 1 → −1 drops below Warning (0).
    fireEvent.click(screen.getByRole("button", { name: "Decrease No cards" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease No cards" }));

    expect(screen.getByText("No cards must be worth at least as much as a Warning.")).toBeTruthy();
    await act(() => new Promise((r) => setTimeout(r, 750)));
    expect(bodiesOf("PATCH", "/api/settings")).toEqual([]);

    // Back to a valid order (No cards 2 ≥ 0 ≥ −1): the error clears and it saves.
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Increase No cards" }));

    expect(screen.queryByText("No cards must be worth at least as much as a Warning.")).toBeNull();
    await waitFor(() =>
      expect(bodiesOf("PATCH", "/api/settings")).toEqual([{ pointsClean: 2, pointsWarning: 0, pointsPenalty: -1 }]),
    );
  });
});

describe("AddStudentsDialog", () => {
  it("add students dialog splits lines, trims, ignores blanks", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === "/api/students" && init?.method === "POST") return json([], 201);
      if (String(url) === "/api/auth/status") return json(authStatus(true));
      return json(BOOT);
    });
    const onOpenChange = vi.fn();
    renderWith(<AddStudentsDialog open onOpenChange={onOpenChange} />, (qc) => qc.setQueryData(qk.bootstrap, BOOT));

    fireEvent.change(screen.getByRole("textbox", { name: /Names/ }), {
      target: { value: "  Ali  \n\nSara\n   \n Omar Haddad \n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add 3 students" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(bodiesOf("POST", "/api/students")).toEqual([{ names: ["Ali", "Sara", "Omar Haddad"], activeFrom: todayISO() }]);
  });
});

function AutosaveHarness({ save }: { save(v: string): Promise<unknown> }) {
  const field = useAutosaveField<string>("Amira", save);
  return (
    <label>
      Name
      <input value={field.draft} onChange={(e) => field.setDraft(e.target.value)} onBlur={() => void field.flush()} />
    </label>
  );
}

describe("useAutosaveField", () => {
  it("useAutosaveField debounces 600ms and flushes on blur", async () => {
    vi.useFakeTimers();
    const save = vi.fn<(v: string) => Promise<unknown>>(async () => undefined);
    render(<AutosaveHarness save={save} />);
    const input = screen.getByRole("textbox", { name: "Name" });

    fireEvent.change(input, { target: { value: "Amir" } });
    fireEvent.change(input, { target: { value: "Amira B" } });
    await act(async () => {
      vi.advanceTimersByTime(599);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("Amira B");

    // Blur saves straight away, and the debounce timer doesn't save it a second time.
    fireEvent.change(input, { target: { value: "Amira Bee" } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("Amira Bee");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
