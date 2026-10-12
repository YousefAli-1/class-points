import type { Page } from "@playwright/test";
import {
  CLASS_LIST,
  DEFAULT_POINTS,
  addDays,
  allTiles,
  expect,
  openLesson,
  pointsBadge,
  pointsOf,
  test,
  tile,
  today,
  type MarkStatus,
} from "./fixtures.ts";

// Reports (spec §8.5): the class report's totals match what the tiles showed, and follow the
// "Also update all past lessons" button (Review Focus 5).

const SUBJECTS = ["Mathematics", "Science"] as const;

/** The class report table's Total column, by student name. */
async function reportTotals(page: Page): Promise<Map<string, number>> {
  const table = page.getByRole("table");
  await expect(table.locator("tbody tr").first()).toBeVisible();
  const totalColumn = (await table.locator("thead th").allTextContents()).findIndex((h) => h.includes("Total"));
  expect(totalColumn).toBeGreaterThan(0);
  const rows = await table.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("th, td"), (cell) => cell.textContent?.trim() ?? "")),
  );
  return new Map(
    // The first cell is the avatar emoji, then the name.
    rows.map((cells) => [cells[0].replace(/^[^\p{L}]+/u, ""), Number(cells[totalColumn].replace("−", "-").replace("+", ""))]),
  );
}

test("reports: week totals equal the sum of tile points for the seeded lessons", async ({ page, api }) => {
  // Seed today's Mathematics and Science lessons with a mix of every status.
  const date = today();
  const ids = await api.studentIds();
  const statuses: MarkStatus[] = ["clean", "warning", "penalty", "absent"];
  for (const [s, subject] of SUBJECTS.entries()) {
    const lessonId = await api.startLesson(date, subject);
    for (const [i, name] of CLASS_LIST.entries()) {
      const studentId = ids.get(name);
      if (studentId === undefined) throw new Error(`No student called ${name}`);
      await api.setMark(lessonId, studentId, statuses[(i + s * Math.floor(i / 4)) % statuses.length]);
    }
  }

  // What the tiles show, added up per child.
  const expected = new Map<string, number>();
  for (const subject of SUBJECTS) {
    await openLesson(page, api, date, subject);
    await expect(allTiles(page)).toHaveCount(CLASS_LIST.length);
    for (const name of CLASS_LIST) expected.set(name, (expected.get(name) ?? 0) + (await pointsOf(tile(page, name))));
  }
  // The seed really mixes the results.
  expect(new Set(expected.values()).size).toBeGreaterThan(2);

  // This week (the default period), filtered to the two seeded subjects.
  await page.goto("/reports");
  await expect(page.getByRole("radio", { name: "Week", checked: true })).toBeVisible();
  const chips = page.getByRole("group", { name: "Subjects" });
  for (const subject of SUBJECTS) {
    await chips.getByRole("button", { name: subject }).click();
    await expect(chips.getByRole("button", { name: subject })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(chips.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: /Science/ })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: /English/ })).toHaveCount(0);

  const totals = await reportTotals(page);
  for (const name of CLASS_LIST) expect.soft(totals.get(name), name).toBe(expected.get(name));
});

test("new point values: past lessons keep theirs until she updates them all, then the report follows", async ({
  page,
  api,
}) => {
  // Review Focus 5. Science today is a shared lane, so the class's values are put back at the end.
  const date = today();
  const lessonId = await api.startLesson(date, "Science");
  const scienceId = await api.subjectId("Science");
  const jana = (await api.studentIds()).get("Jana") ?? 0;
  await api.setMark(lessonId, jana, "clean");
  const dayReport = `/reports?period=day&date=${date}&subjects=${scienceId}`;

  await api.unlockAdmin();
  try {
    // "No cards" goes from +1 to +3 (it autosaves).
    await page.goto("/admin/points");
    const increase = page.getByRole("button", { name: "Increase No cards" });
    await increase.click();
    await increase.click();
    await expect(page.getByRole("group", { name: "No cards" }).locator("output")).toHaveText("+3");
    // Not the "Saved" note: it can still be showing the +2 save while +3 waits for its 600 ms pause.
    await expect.poll(async () => (await api.bootstrap()).settings.pointsClean).toBe(3);

    // A lesson started from now on takes the new values (checked on an empty past day)…
    const later = await api.startLesson(addDays(date, -5), "Science");
    expect((await api.lessonsOn(addDays(date, -5)))[0]).toMatchObject({ id: later, pointsClean: 3 });
    await api.deleteLesson(later);

    // …but today's lesson, started before, keeps +1 on the tile and in the report.
    await openLesson(page, api, date, "Science");
    await expect(pointsBadge(tile(page, "Jana"))).toHaveText("+1");
    await page.goto(dayReport);
    expect((await reportTotals(page)).get("Jana")).toBe(1);

    // "Also update all past lessons" rewrites it.
    await page.goto("/admin/points");
    await page.getByRole("button", { name: "Also update all past lessons" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Update them" }).click();
    await expect(page.getByText(/^\d+ lessons? updated$/)).toBeVisible();

    await openLesson(page, api, date, "Science");
    await expect(pointsBadge(tile(page, "Jana"))).toHaveText("+3");
    await page.goto(dayReport);
    expect((await reportTotals(page)).get("Jana")).toBe(3);
  } finally {
    await api.unlockAdmin();
    await api.setPoints(DEFAULT_POINTS);
    await api.recalculate();
  }
});
