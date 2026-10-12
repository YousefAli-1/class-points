import type { Page } from "@playwright/test";
import {
  addDays,
  type ClassApi,
  allTiles,
  expect,
  isoDate,
  openLesson,
  penaltyCard,
  pointsBadge,
  saveIndicator,
  test,
  tile,
  today,
  warningCard,
} from "./fixtures.ts";

// The core screen (spec §8.3, §8.4) on the class created by global.setup.ts.
// English today belongs to this file: the first test starts it through the UI.

test("start the English lesson, give Lina a warning and a penalty, reload: still −1", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start English" }).click();

  await expect(page).toHaveURL(new RegExp(`/day/${today()}\\?subject=\\d+$`));
  await expect(page.getByRole("combobox", { name: "Subject" })).toContainText("English");
  await expect(allTiles(page)).toHaveCount(24);

  const lina = tile(page, "Lina");
  await expect(pointsBadge(lina)).toHaveText("+1");
  await expect(penaltyCard(page, "Lina")).toHaveAttribute("aria-pressed", "false");

  await warningCard(page, "Lina").click();
  await expect(warningCard(page, "Lina")).toHaveAttribute("aria-pressed", "true");
  await expect(pointsBadge(lina)).toHaveText("0");

  await penaltyCard(page, "Lina").click();
  await expect(penaltyCard(page, "Lina")).toHaveAttribute("aria-pressed", "true");
  await expect(pointsBadge(lina)).toHaveText("−1");

  const footer = page.getByRole("list", { name: "Lesson so far" });
  await expect(footer).toContainText("23");
  await expect(footer).toContainText("0 warnings");
  await expect(footer).toContainText("1 penalty");
  await expect(saveIndicator(page)).toHaveText("All saved");

  await page.reload();
  await expect(pointsBadge(tile(page, "Lina"))).toHaveText("−1");
  await expect(warningCard(page, "Lina")).toHaveAttribute("aria-pressed", "true");
  await expect(penaltyCard(page, "Lina")).toHaveAttribute("aria-pressed", "true");
  await expect(pointsBadge(tile(page, "Adam"))).toHaveText("+1");
});

test("a penalty without a warning is blocked with a hint", async ({ page, api }) => {
  await api.startLesson(today(), "English");
  await openLesson(page, api, today(), "English");

  const omar = tile(page, "Omar");
  await expect(pointsBadge(omar)).toHaveText("+1");
  await penaltyCard(page, "Omar").click();

  await expect(omar.getByRole("status")).toHaveText("Give a warning first");
  await expect(penaltyCard(page, "Omar")).toHaveAttribute("aria-pressed", "false");
  await expect(pointsBadge(omar)).toHaveText("+1");
  await expect(saveIndicator(page)).toHaveText("All saved");

  // Nothing was saved for him.
  await page.reload();
  await expect(pointsBadge(tile(page, "Omar"))).toHaveText("+1");
  await expect(warningCard(page, "Omar")).toHaveAttribute("aria-pressed", "false");
});

test("all 24 tiles are visible without scrolling", async ({ page, api }) => {
  await api.startLesson(today(), "English");
  await openLesson(page, api, today(), "English");
  await expect(allTiles(page)).toHaveCount(24);

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("No viewport");
  const footer = await page.locator("footer", { has: page.getByRole("list", { name: "Lesson so far" }) }).boundingBox();
  if (!footer) throw new Error("No lesson footer");
  for (const box of await Promise.all((await allTiles(page).all()).map((t) => t.boundingBox()))) {
    if (!box) throw new Error("A tile isn't rendered");
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    // The sticky footer must not cover the last row.
    expect(box.y + box.height).toBeLessThanOrEqual(footer.y);
  }
  expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
});

test("tapping a past day opens its first started lesson; a future day stays locked", async ({ page, api }) => {
  // Only Mathematics was taught yesterday, so the day opens on it rather than on English (the first
  // subject). Nobody in the class counted yet on that day: they joined today (late joiners, spec §4.3).
  const yesterday = addDays(today(), -1);
  const lessonId = await api.startLesson(yesterday, "Mathematics");

  await page.goto(`/?month=${yesterday.slice(0, 7)}`);
  const cell = page.getByTestId(`day-${yesterday}`);
  await expect(cell.getByTestId("lesson-dot")).toHaveAttribute("data-subject", "Mathematics");
  await cell.click();

  await expect(page).toHaveURL(new RegExp(`/day/${yesterday}$`));
  await expect(page.getByRole("combobox", { name: "Subject" })).toContainText("Mathematics");
  await expect(page.getByRole("heading", { name: "No students on this day" })).toBeVisible();

  // Review Focus 3: a child who joined today can't get a mark in yesterday's lesson.
  const adam = (await api.studentIds()).get("Adam") ?? 0;
  const refused = await api.putMark(lessonId, adam, "warning");
  expect(refused.status()).toBe(400);
  expect(await api.storedStatus(yesterday, lessonId, "Adam")).toBe("clean");

  // A lesson started there by mistake can still be cancelled, and its dot goes away.
  await page.getByRole("button", { name: "More lesson options" }).click();
  await page.getByRole("menuitem", { name: /Cancel this lesson/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByRole("button", { name: "Start Mathematics lesson" })).toBeVisible();
  expect(await api.lessonsOn(yesterday)).toEqual([]);
  await page.goto(`/?month=${yesterday.slice(0, 7)}`);
  await expect(page.getByTestId(`day-${yesterday}`)).toBeVisible();
  await expect(page.getByTestId(`day-${yesterday}`).getByTestId("lesson-dot")).toHaveCount(0);

  const tomorrow = addDays(today(), 1);
  await page.goto(`/?month=${tomorrow.slice(0, 7)}`);
  // The cell is aria-disabled but still answers a tap (with the toast), so skip Playwright's enabled check.
  await page.getByTestId(`day-${tomorrow}`).click({ force: true });
  await expect(page.getByText("That day hasn't come yet 🌱")).toBeVisible();
  await expect(page).toHaveURL(/\/(\?month=[\d-]+)?$/);
});

test.describe("on a device far ahead of UTC", () => {
  // Kiritimati is UTC+14: from 10:00 UTC its date is UTC-today + 1, the latest the server accepts
  // (Review Focus 1). Science today is a shared lane, so the test cancels what it starts.
  test.use({ timezoneId: "Pacific/Kiritimati" });

  test("its own today can be started, and cancelled again", async ({ page, api }) => {
    const localToday = await page.evaluate(() => {
      const d = new Date();
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
    });
    expect(localToday >= isoDate(new Date())).toBe(true);
    await api.cancelLesson(localToday, "Science");

    await openLessonPage(page, api, localToday);
    await expect(page.getByText(/· Today/)).toBeVisible();
    await page.getByRole("button", { name: "Start Science lesson" }).click();
    await expect(allTiles(page)).toHaveCount(24);

    await page.getByRole("button", { name: "More lesson options" }).click();
    await page.getByRole("menuitem", { name: /Cancel this lesson/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(page.getByRole("button", { name: "Start Science lesson" })).toBeVisible();
    expect(await api.lessonsOn(localToday)).not.toContainEqual(
      expect.objectContaining({ subjectId: await api.subjectId("Science") }),
    );
  });
});

test("the server takes a lesson dated up to UTC-today + 1, and refuses the day after", async ({ api }) => {
  // Review Focus 1 on the real build, independent of the time of day. English is this file's lane:
  // a lesson this test creates is removed again (200 means it was already there, e.g. local today).
  const utcToday = new Date().toISOString().slice(0, 10);
  const latest = await api.postLesson(addDays(utcToday, 1), "English");
  expect([200, 201]).toContain(latest.status());
  if (latest.status() === 201) await api.deleteLesson(((await latest.json()) as { id: number }).id);

  const tooFar = await api.postLesson(addDays(utcToday, 2), "English");
  expect(tooFar.status()).toBe(400);
  expect(await tooFar.json()).toEqual({ error: { code: "BAD_REQUEST", message: "That day hasn't come yet." } });
});

/** The day page for Science before its lesson exists (no tiles to wait for yet). */
async function openLessonPage(page: Page, api: ClassApi, date: string): Promise<void> {
  await page.goto(`/day/${date}?subject=${await api.subjectId("Science")}`);
}
