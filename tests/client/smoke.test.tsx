import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("client test environment", () => {
  it("renders React into jsdom", () => {
    render(<h1>Class Points</h1>);

    expect(screen.getByRole("heading", { name: "Class Points" })).toBeTruthy();
  });

  // Runs after the test above (tests in a file run in order), so it fails if rendered output leaks between tests.
  it("starts each test with an empty document body", () => {
    expect(document.body.innerHTML).toBe("");
  });
});
