import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppToaster } from "@client/components/AppToaster.tsx";
import { undoToast } from "@client/features/admin/undoToast.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("undo toast", () => {
  it("has a chunky 56px Undo button that stays up for 8 seconds", async () => {
    render(<AppToaster />);
    const undo = vi.fn();
    act(() => undoToast("Adam moved to Removed students", undo));

    const button = await vi.waitFor(() => screen.getByRole("button", { name: "Undo" }));
    // Sonner styles nothing in an unstyled toast, so the app's classes are the whole look.
    expect(button.className).toContain("min-h-14");
    expect(button.className).toContain("bg-forest");

    // Still there after sonner's 4 s default…
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(screen.getByText("Adam moved to Removed students")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("goes away by itself after 8 seconds", async () => {
    render(<AppToaster />);
    act(() => undoToast("Maths moved to Removed subjects", () => {}));
    await vi.waitFor(() => screen.getByText("Maths moved to Removed subjects"));

    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(screen.queryByText("Maths moved to Removed subjects")).toBeNull();
  });
});
