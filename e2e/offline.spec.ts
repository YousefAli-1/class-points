import type { Request } from "@playwright/test";
import {
  PASSWORD,
  expect,
  openLesson,
  penaltyCard,
  pointsBadge,
  saveIndicator,
  test,
  tile,
  today,
  warningCard,
  type ClassApi,
} from "./fixtures.ts";

// The save queue (spec §10, Review Focus 2 and 4): taps survive a lost connection and an expired
// session, and only the newest state per child is sent. These tests use the Science lane.

const isMarkPut = (r: Request) => r.method() === "PUT" && /\/api\/lessons\/\d+\/marks\/\d+$/.test(r.url());

/** A fresh Science lesson for today, with every child on a clean slate. */
async function freshScienceLesson(api: ClassApi): Promise<number> {
  await api.cancelLesson(today(), "Science");
  return api.startLesson(today(), "Science");
}

test("offline taps wait in the queue, then save when the connection is back", async ({ page, context, api }) => {
  const lessonId = await freshScienceLesson(api);
  await openLesson(page, api, today(), "Science");
  await expect(saveIndicator(page)).toHaveText("All saved");

  const sent: { url: string; status: string }[] = [];
  page.on("request", (r) => {
    if (isMarkPut(r)) sent.push({ url: r.url(), status: (r.postDataJSON() as { status: string }).status });
  });

  await context.setOffline(true);
  await expect(saveIndicator(page)).toHaveText("Offline: will save when back");

  // Sara: warning, then penalty. Dana: warning, then off again. Each child sends only her newest state.
  await warningCard(page, "Sara").click();
  await penaltyCard(page, "Sara").click();
  await warningCard(page, "Dana").click();
  await warningCard(page, "Dana").click();
  await expect(pointsBadge(tile(page, "Sara"))).toHaveText("−1");
  await expect(pointsBadge(tile(page, "Dana"))).toHaveText("+1");
  await expect(saveIndicator(page)).toHaveText("Offline: will save when back");
  expect(await api.storedStatus(today(), lessonId, "Sara")).toBe("clean");

  await context.setOffline(false);
  await expect(saveIndicator(page)).toHaveText("All saved");
  // One mark per child, each with only her newest state (never Sara's or Dana's warning).
  expect(new Set(sent.map((s) => s.url)).size).toBe(2);
  expect(new Set(sent.map((s) => s.status))).toEqual(new Set(["penalty", "clean"]));
  expect(await api.storedStatus(today(), lessonId, "Sara")).toBe("penalty");
  expect(await api.storedStatus(today(), lessonId, "Dana")).toBe("clean");

  await page.reload();
  await expect(pointsBadge(tile(page, "Sara"))).toHaveText("−1");
  await expect(penaltyCard(page, "Sara")).toHaveAttribute("aria-pressed", "true");
  await expect(pointsBadge(tile(page, "Dana"))).toHaveText("+1");
});

test("an older offline tap never undoes a newer change from another device", async ({ page, context, api }) => {
  // Review Focus 2: last write wins by the time of the tap, not by the time it reaches the server.
  const lessonId = await freshScienceLesson(api);
  const karim = (await api.studentIds()).get("Karim") ?? 0;
  await openLesson(page, api, today(), "Science");

  // The iPad loses the connection and gives Karim a warning…
  await context.setOffline(true);
  await expect(saveIndicator(page)).toHaveText("Offline: will save when back");
  await warningCard(page, "Karim").click();
  await expect(pointsBadge(tile(page, "Karim"))).toHaveText("0");

  // …then, a moment later, the laptop gives him a penalty, which saves at once.
  await api.setMark(lessonId, karim, "penalty");
  expect(await api.storedStatus(today(), lessonId, "Karim")).toBe("penalty");

  // Back online, the iPad's older tap arrives last but doesn't win, and the iPad shows the newer state.
  await context.setOffline(false);
  await expect(saveIndicator(page)).toHaveText("All saved");
  expect(await api.storedStatus(today(), lessonId, "Karim")).toBe("penalty");
  await expect(pointsBadge(tile(page, "Karim"))).toHaveText("−1");
  await expect(penaltyCard(page, "Karim")).toHaveAttribute("aria-pressed", "true");
});

test("expired session keeps taps: log in again and the tap is saved", async ({ page, context, api }) => {
  const lessonId = await freshScienceLesson(api);
  await openLesson(page, api, today(), "Science");

  // The session cookie is gone (as when it expires): the tap is answered with 401.
  await context.clearCookies();
  await warningCard(page, "Huda").click();

  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill("not-my-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("That password isn't right.")).toBeVisible();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  // Back where she was, and the waiting tap reaches the server.
  await expect(page).toHaveURL(new RegExp(`/day/${today()}\\?subject=\\d+$`));
  await expect(saveIndicator(page)).toHaveText("All saved");
  expect(await api.storedStatus(today(), lessonId, "Huda")).toBe("warning");

  await page.reload();
  await expect(pointsBadge(tile(page, "Huda"))).toHaveText("0");
  await expect(warningCard(page, "Huda")).toHaveAttribute("aria-pressed", "true");
});
