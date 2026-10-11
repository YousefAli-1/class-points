import { beforeEach, describe, expect, it } from "vitest";
import type { Holiday } from "@shared/types.ts";
import { del, expectError, expectJson, getBootstrap } from "./data-helpers.ts";
import { adminSession, api, resetDb } from "./helpers.ts";

beforeEach(resetDb);

const createHoliday = (cookie: string, body: Record<string, unknown>) => api("/api/holidays", { body }, cookie);

describe("holidays", () => {
  it("holidays: create/delete; invalid range 400", async () => {
    const cookie = await adminSession();

    const winter = await expectJson<Holiday>(
      createHoliday(cookie, { startDate: "2025-12-20", endDate: "2026-01-04", label: " Winter break " }),
      201,
    );
    expect(winter).toEqual<Holiday>({ id: 1, startDate: "2025-12-20", endDate: "2026-01-04", label: "Winter break" });
    const snowDay = await expectJson<Holiday>(
      createHoliday(cookie, { startDate: "2025-02-03", endDate: "2025-02-03", label: "Snow day" }),
      201,
    );

    const backwards = await expectError(
      createHoliday(cookie, { startDate: "2026-01-04", endDate: "2025-12-20", label: "Backwards" }),
      400,
    );
    expect(backwards.message).toBe("The last day can't be before the first day.");
    await expectError(createHoliday(cookie, { startDate: "2025-01-01", endDate: "2026-01-02", label: "Long" }), 400);
    await expectError(createHoliday(cookie, { startDate: "2025-01-01", endDate: "2025-01-02", label: "" }), 400);

    // Listed by start date.
    expect((await getBootstrap(cookie)).holidays).toEqual([snowDay, winter]);

    expect(await expectJson(del(`/api/holidays/${winter.id}`, cookie))).toEqual({ ok: true });
    expect((await getBootstrap(cookie)).holidays).toEqual([snowDay]);
    expect((await expectError(del(`/api/holidays/${winter.id}`, cookie), 404)).code).toBe("NOT_FOUND");
  });
});
