import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PinPad } from "@client/components/PinPad.tsx";

/** A PinPad with its own state, next to an input and a button that are not part of it. */
function Harness({ onSubmit = vi.fn() }: { onSubmit?: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  return (
    <div>
      <input aria-label="Outside input" />
      <button type="button">Outside button</button>
      <PinPad value={pin} onChange={setPin} onSubmit={onSubmit} />
    </div>
  );
}

const filledDots = () => screen.getByTestId("pin-dots").querySelectorAll("[data-filled=true]").length;

describe("PinPad keyboard", () => {
  it("typing digits in an outside input does not fill the PIN", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Outside input" });
    input.focus();

    for (const key of ["1", "2", "3"]) {
      const notPrevented = fireEvent.keyDown(input, { key });
      expect(notPrevented).toBe(true);
    }
    expect(fireEvent.keyDown(input, { key: "Backspace" })).toBe(true);

    expect(filledDots()).toBe(0);
  });

  it("Enter on an outside button is not prevented", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    for (const key of ["1", "2", "3", "4"]) fireEvent.keyDown(document.body, { key });
    expect(filledDots()).toBe(4);

    const button = screen.getByRole("button", { name: "Outside button" });
    button.focus();
    const notPrevented = fireEvent.keyDown(button, { key: "Enter" });

    expect(notPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("digits typed with body focus still fill the PIN", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    for (const key of ["1", "2", "3", "4"]) {
      expect(fireEvent.keyDown(document.body, { key })).toBe(false); // handled by the pad
    }
    expect(filledDots()).toBe(4);

    fireEvent.keyDown(document.body, { key: "Backspace" });
    expect(filledDots()).toBe(3);

    fireEvent.keyDown(document.body, { key: "4" });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("1234");
  });

  it("keys typed while one of the pad's own keys has focus still work", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const seven = screen.getByRole("button", { name: "7" });
    seven.focus();

    for (const key of ["9", "8", "7", "6"]) fireEvent.keyDown(seven, { key });
    expect(filledDots()).toBe(4);

    // Enter submits the PIN rather than "clicking" the focused 7.
    expect(fireEvent.keyDown(seven, { key: "Enter" })).toBe(false);
    expect(onSubmit).toHaveBeenCalledWith("9876");
  });
});

describe("PinPad keys", () => {
  it("digit keys have no active/focus style classes", () => {
    render(<Harness />);

    for (const digit of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      const classes = screen.getByRole("button", { name: digit }).className.split(/\s+/);
      // The pressable chunky edge moves on :active; the pad uses the still edge instead.
      expect(classes).not.toContain("chunky");
      expect(classes).toContain("chunky-still");
      // The base focus ring is switched off on the key...
      expect(classes).toContain("focus-visible:outline-none");
      // ...and nothing else reacts to press, hover or focus.
      const highlights = classes.filter(
        (c) => /(^|:)(active|hover|focus|focus-visible|focus-within):/.test(c) && c !== "focus-visible:outline-none",
      );
      expect(highlights).toEqual([]);
      expect(classes.some((c) => c.startsWith("transition"))).toBe(false);
    }
  });

  it("the pad container carries the focus indicator", () => {
    render(<Harness />);
    const pad = screen.getByRole("group", { name: "PIN keys" });
    expect(pad.className).toMatch(/has-\[:focus-visible\]:outline/);
  });
});
