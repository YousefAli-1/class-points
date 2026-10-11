import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-registers cleanup when afterEach is a global, and Vitest globals are off.
afterEach(() => {
  cleanup();
});
