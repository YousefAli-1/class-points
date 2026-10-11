import { beforeEach, describe, expect, it } from "vitest";
import type { Subject } from "@shared/types.ts";
import {
  count,
  del,
  expectError,
  expectJson,
  getBootstrap,
  PAST,
  patch,
  post,
  startLesson,
} from "./data-helpers.ts";
import { adminSession, api, resetDb } from "./helpers.ts";

beforeEach(resetDb);

describe("create, edit and reorder", () => {
  it("creates a subject at the end of the list", async () => {
    const cookie = await adminSession();

    const art = await expectJson<Subject>(
      api("/api/subjects", { body: { name: " Art ", emoji: "🎨", color: "coral" } }, cookie),
      201,
    );

    expect(art).toEqual<Subject>({ id: 4, name: "Art", emoji: "🎨", color: "coral", sortOrder: 3, archivedAt: null });
    expect((await getBootstrap(cookie)).subjects.at(-1)).toEqual(art);
    await expectError(api("/api/subjects", { body: { name: "Art", emoji: "🎨", color: "plaid" } }, cookie), 400);
  });

  it("edits the given fields", async () => {
    const cookie = await adminSession();

    const updated = await expectJson<Subject>(patch("/api/subjects/1", { name: "Reading", emoji: "📖" }, cookie));

    expect(updated).toEqual({ id: 1, name: "Reading", emoji: "📖", color: "sky", sortOrder: 0, archivedAt: null });
    expect((await getBootstrap(cookie)).subjects[0]).toEqual(updated);
    await expectError(patch("/api/subjects/99", { name: "X" }, cookie), 404);
  });

  it("reorders", async () => {
    const cookie = await adminSession();

    const reordered = await expectJson<Subject[]>(api("/api/subjects/reorder", { body: { ids: [3, 1, 2] } }, cookie));

    expect(reordered.map((s) => [s.id, s.sortOrder])).toEqual([
      [3, 0],
      [1, 1],
      [2, 2],
    ]);
    expect((await getBootstrap(cookie)).subjects).toEqual(reordered);
  });
});

describe("archive, restore and delete", () => {
  it("subjects: cannot delete with lessons; cannot archive last", async () => {
    const cookie = await adminSession();
    await startLesson(cookie, PAST, 1);

    const inUse = await expectError(del("/api/subjects/1", cookie), 409);
    expect(inUse.code).toBe("CONFLICT");
    expect(await count("subjects")).toBe(3);

    expect(await expectJson(del("/api/subjects/3", cookie))).toEqual({ ok: true });
    const archived = await expectJson<Subject>(post("/api/subjects/2/archive", cookie));
    expect(archived.archivedAt).toEqual(expect.any(Number));

    const last = await expectError(post("/api/subjects/1/archive", cookie), 400);
    expect(last.message).toBe("Keep at least one subject.");
    expect((await getBootstrap(cookie)).subjects.map((s) => [s.id, s.archivedAt === null])).toEqual([
      [1, true],
      [2, false],
    ]);

    const restored = await expectJson<Subject>(post("/api/subjects/2/restore", cookie));
    expect(restored.archivedAt).toBeNull();
    await expectJson(post("/api/subjects/1/archive", cookie));
  });

  it("cannot delete the last active subject either", async () => {
    const cookie = await adminSession();
    await expectJson(post("/api/subjects/2/archive", cookie));
    await expectJson(post("/api/subjects/3/archive", cookie));

    const error = await expectError(del("/api/subjects/1", cookie), 400);

    expect(error.message).toBe("Keep at least one subject.");
    expect(await expectJson(del("/api/subjects/2", cookie))).toEqual({ ok: true });
  });

  it("keeps the first archive time when archived again", async () => {
    const cookie = await adminSession();
    const first = await expectJson<Subject>(post("/api/subjects/2/archive", cookie));

    const again = await expectJson<Subject>(post("/api/subjects/2/archive", cookie));

    expect(again.archivedAt).toBe(first.archivedAt);
  });

  it("answers 404 for an unknown subject", async () => {
    const cookie = await adminSession();

    await expectError(post("/api/subjects/99/archive", cookie), 404);
    await expectError(post("/api/subjects/99/restore", cookie), 404);
    await expectError(del("/api/subjects/99", cookie), 404);
  });
});
