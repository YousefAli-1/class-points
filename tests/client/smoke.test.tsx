import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("client test environment", () => {
  it("renders React into jsdom", () => {
    render(<h1>Class Points</h1>);

    expect(screen.getByRole("heading", { name: "Class Points" })).toBeTruthy();
  });
});
