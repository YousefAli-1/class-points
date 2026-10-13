import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus } from "@shared/types.ts";
import { ResetPage } from "@client/features/auth/ResetPage.tsx";
import { SetupPage } from "@client/features/auth/SetupPage.tsx";
import { qk } from "@client/lib/queryKeys.ts";

vi.mock("@client/lib/sound.ts", () => ({ useSound: () => vi.fn() }));

function renderPage(page: ReactNode, auth: AuthStatus) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.auth, auth);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The setup code is masked, never offered for autofill, and can be shown to check it. */
function expectMaskedWithShowButton() {
  const code = screen.getByLabelText("Setup code");
  fireEvent.change(code, { target: { value: "0b5c-secret" } });
  expect(code.getAttribute("type")).toBe("password");
  expect(code.getAttribute("autocomplete")).toBe("off");

  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(code.getAttribute("type")).toBe("text");
  expect((code as HTMLInputElement).value).toBe("0b5c-secret");

  fireEvent.click(screen.getByRole("button", { name: "Hide" }));
  expect(code.getAttribute("type")).toBe("password");
}

beforeEach(() => {
  // Nothing in these tests should reach the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setup code field", () => {
  it("is masked on the reset page", () => {
    renderPage(<ResetPage />, { setupDone: true, loggedIn: false, adminUnlocked: false, adminUntil: null });
    expectMaskedWithShowButton();
  });

  it("is masked in the setup wizard", () => {
    renderPage(<SetupPage />, { setupDone: false, loggedIn: false, adminUnlocked: false, adminUntil: null });
    expectMaskedWithShowButton();
  });
});
