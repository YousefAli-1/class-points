import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The seed and restore scripts write their SQL (for a restore: every child's name and marks) to a
// temp file for `wrangler d1 execute`. Wrangler itself is replaced here, so nothing really runs.

const spawnSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync }));

const { executeOnD1 } = await import("../../scripts/lib/d1.ts");

/** The --file=… path executeOnD1 handed to wrangler. */
function sqlFile(): string {
  const args = spawnSync.mock.calls[0][1] as string[];
  const arg = args.find((a) => a.startsWith("--file="));
  if (!arg) throw new Error("No --file argument");
  return arg.slice("--file=".length);
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  spawnSync.mockReset();
  vi.restoreAllMocks();
});

describe("executeOnD1", () => {
  it("deletes the SQL file and its folder after a successful run", () => {
    let seen = "";
    spawnSync.mockImplementation((_node: string, args: string[]) => {
      seen = readFileSync(args.find((a) => a.startsWith("--file="))!.slice(7), "utf8");
      return { status: 0, stdout: "" };
    });

    executeOnD1(["INSERT INTO students (name) VALUES ('Lina');"], "local");

    expect(seen).toBe("INSERT INTO students (name) VALUES ('Lina');\n");
    expect(existsSync(dirname(sqlFile()))).toBe(false);
  });

  it("keeps the SQL file when wrangler fails, and exits with its status", () => {
    spawnSync.mockReturnValue({ status: 3, stdout: "boom" });
    const exit = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);

    expect(() => executeOnD1(["SELECT 1;"], "remote")).toThrow("exit 3");

    const file = sqlFile();
    expect(exit).toHaveBeenCalledWith(3);
    expect(existsSync(file)).toBe(true);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(file));
    rmSync(dirname(file), { recursive: true, force: true });
  });
});
