// Shared by the seed and restore scripts: SQL text for D1 and a way to run it through Wrangler.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type SqlValue = string | number | boolean | null;

/** A SQL literal. Strings are single-quoted with quotes doubled; numbers must be finite. */
export function sql(value: SqlValue): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/** Rows per INSERT: well under SQLite's 500-row VALUES limit and D1's 100 KB statement limit. */
const CHUNK = 100;

/** INSERT statements for `rows`, in chunks. Each row lists its values in `columns` order. */
export function insertRows(table: string, columns: readonly string[], rows: readonly SqlValue[][]): string[] {
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows
      .slice(i, i + CHUNK)
      .map((row) => {
        if (row.length !== columns.length) throw new Error(`${table}: expected ${columns.length} values, got ${row.length}`);
        return `(${row.map(sql).join(", ")})`;
      })
      .join(",\n  ");
    statements.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${values};`);
  }
  return statements;
}

const WRANGLER = join(import.meta.dirname, "..", "..", "node_modules", "wrangler", "bin", "wrangler.js");

/**
 * Writes `statements` to a temp file and runs it with `wrangler d1 execute DB`. The file holds class
 * data (a restore has every child's name and marks), so it is deleted after a successful run. On a
 * failure it is kept for debugging, its path is printed and the process exits.
 */
export function executeOnD1(statements: readonly string[], target: "local" | "remote"): void {
  const dir = mkdtempSync(join(tmpdir(), "class-points-"));
  const file = join(dir, "script.sql");
  writeFileSync(file, statements.join("\n") + "\n", "utf8");
  console.log(`Running ${statements.length} statements on the ${target} database…`);
  // Wrangler echoes every statement's result: keep that quiet unless something goes wrong.
  const result = spawnSync(process.execPath, [WRANGLER, "d1", "execute", "DB", `--${target}`, `--file=${file}`, "--yes"], {
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    console.error(`\nwrangler d1 execute failed (SQL kept at ${file}: delete it when you're done).`);
    process.exit(result.status ?? 1);
  }
  rmSync(dir, { recursive: true, force: true });
}
