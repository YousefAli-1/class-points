import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { AuthStatus } from "@shared/types.ts";
import { RequireAuth } from "@client/components/layout/RequireAuth.tsx";
import { SaveIndicator } from "@client/components/layout/SaveIndicator.tsx";
import { qk } from "@client/lib/queryKeys.ts";
import type { SaveState } from "@client/lib/saveQueue.ts";
import { SaveQueueContext, type SaveQueueStore } from "@client/lib/saveQueueContext.ts";

function fakeStore(state: SaveState, retryNow = vi.fn()): SaveQueueStore {
  const snapshot = { state, size: state === "saved" ? 0 : 1, entries: [] };
  return {
    queue: {} as SaveQueueStore["queue"],
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    refresh: () => {},
    enqueueMark: () => {},
    retryNow,
  };
}

describe("SaveIndicator", () => {
  it.each([
    ["saved", "All saved"],
    ["saving", "Saving…"],
    ["offline", "Offline: will save when back"],
    ["error", "Couldn’t save, retrying"],
  ] as const)("%s shows “%s”", (state, text) => {
    render(
      <SaveQueueContext.Provider value={fakeStore(state)}>
        <SaveIndicator />
      </SaveQueueContext.Provider>,
    );
    expect(screen.getByRole("status").textContent).toContain(text);
  });

  it("offers a manual retry when saving fails", () => {
    const retryNow = vi.fn();
    render(
      <SaveQueueContext.Provider value={fakeStore("error", retryNow)}>
        <SaveIndicator />
      </SaveQueueContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retryNow).toHaveBeenCalledTimes(1);
  });
});

function Where() {
  const location = useLocation();
  return (
    <p>
      at {location.pathname} from {(location.state as { from?: string } | null)?.from ?? "-"}
    </p>
  );
}

function renderGuarded(status: AuthStatus, start = "/day/2026-10-11") {
  const qc = new QueryClient();
  qc.setQueryData(qk.auth, status);
  qc.setQueryDefaults(qk.auth, { staleTime: Infinity });
  const router = createMemoryRouter(
    [
      { path: "/setup", element: <Where /> },
      { path: "/login", element: <Where /> },
      { path: "*", element: <RequireAuth>secret class page</RequireAuth> },
    ],
    { initialEntries: [start] },
  );
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("RequireAuth", () => {
  it("sends a fresh install to /setup", () => {
    renderGuarded({ setupDone: false, loggedIn: false, adminUnlocked: false, adminUntil: null });
    expect(screen.getByText(/at \/setup/)).toBeTruthy();
  });

  it("sends a logged-out teacher to /login, remembering where she was", () => {
    renderGuarded({ setupDone: true, loggedIn: false, adminUnlocked: false, adminUntil: null });
    expect(screen.getByText("at /login from /day/2026-10-11")).toBeTruthy();
  });

  it("shows the page when logged in", () => {
    renderGuarded({ setupDone: true, loggedIn: true, adminUnlocked: false, adminUntil: null });
    expect(screen.getByText("secret class page")).toBeTruthy();
  });
});
