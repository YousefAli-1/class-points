import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PinGate } from "@client/components/PinGate.tsx";

const fetchMock = vi.fn<typeof fetch>();

const UNLOCKED = { setupDone: true, loggedIn: true, adminUnlocked: true, adminUntil: 600_000 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderGate(onUnlocked = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PinGate title="Admin" subtitle="Enter your PIN" onUnlocked={onUnlocked} />
    </QueryClientProvider>,
  );
  return { qc, onUnlocked };
}

const press = (...keys: string[]) => {
  for (const k of keys) fireEvent.click(screen.getByRole("button", { name: k }));
};

const dots = () => screen.getByTestId("pin-dots");

/** Bodies of the unlock requests sent so far. */
const unlockBodies = () =>
  fetchMock.mock.calls.filter(([url]) => String(url) === "/api/auth/unlock").map(([, init]) => JSON.parse(String(init?.body)));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PinGate", () => {
  it("shows filled dots only, never the digits", () => {
    renderGate();

    press("1", "2", "3");

    expect(dots().querySelectorAll("[data-filled=true]")).toHaveLength(3);
    expect(dots().textContent).not.toMatch(/\d/);
  });

  it("auto-submits at 6 digits and unlocks", async () => {
    fetchMock.mockImplementation(async () => json(UNLOCKED));
    const { onUnlocked } = renderGate();

    press("1", "2", "3", "4", "5", "6");

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
    expect(unlockBodies()).toEqual([{ pin: "123456" }]);
  });

  it("OK submits 4 or 5 digits and is off before that", async () => {
    fetchMock.mockImplementation(async () => json(UNLOCKED));
    const { onUnlocked } = renderGate();
    const ok = screen.getByRole("button", { name: "OK" }) as HTMLButtonElement;

    press("9", "8", "7");
    expect(ok.disabled).toBe(true);
    press("6");
    expect(ok.disabled).toBe(false);
    press("OK");

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(unlockBodies()).toEqual([{ pin: "9876" }]);
  });

  it("deletes the last digit with ⌫ and accepts the keyboard", async () => {
    fetchMock.mockImplementation(async () => json(UNLOCKED));
    const { onUnlocked } = renderGate();

    press("1", "2", "Delete last digit");
    expect(dots().querySelectorAll("[data-filled=true]")).toHaveLength(1);

    for (const key of ["2", "3", "4"]) fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(unlockBodies()).toEqual([{ pin: "1234" }]);
  });

  it("a wrong PIN says 'Not quite, try again' and clears the dots", async () => {
    fetchMock.mockImplementation(async () => json({ error: { code: "UNAUTHORIZED", message: "That PIN isn't right." } }, 401));
    const { onUnlocked } = renderGate();

    press("1", "1", "1", "1", "OK");

    expect(await screen.findByText("Not quite, try again")).toBeTruthy();
    expect(dots().querySelectorAll("[data-filled=true]")).toHaveLength(0);
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("too many tries shows a countdown and holds the keys until it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockImplementation(async () =>
      json({ error: { code: "RATE_LIMITED", message: "Too many tries.", retryAfterMs: 125_000 } }, 429),
    );
    renderGate();

    press("1", "2", "3", "4", "OK");

    expect(await screen.findByText(/Too many tries/)).toBeTruthy();
    expect(screen.getByText(/2:05/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "5" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(126_000);
    });
    expect(screen.queryByText(/Too many tries/)).toBeNull();
    expect((screen.getByRole("button", { name: "5" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
