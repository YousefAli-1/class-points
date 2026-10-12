import { PIN, addDays, allTiles, enterPin, expect, openLesson, test, tile, today } from "./fixtures.ts";

// Admin behind the PIN (spec §8.6). All tests here share the project's one session, so each one
// starts from the admin state it needs.

const WRONG_PIN = "1111";

/** A second class list, pasted in one go. They count from next month, so today's lessons keep 24 tiles. */
const NEW_CLASS = [
  "Amira", "Ben", "Chloe", "Dev", "Ella", "Finn", "Grace", "Hugo",
  "Isla", "Jack", "Kai", "Luca", "Mia", "Nora", "Olly", "Pia",
  "Quinn", "Rosa", "Sam", "Theo", "Uma", "Vera", "Will", "Zoe",
];

test("admin: a wrong PIN is refused, the right one unlocks, Lock locks again", async ({ page, api }) => {
  await api.lockAdmin();
  await page.goto("/admin");

  const keys = page.getByRole("group", { name: "PIN keys" });
  await expect(keys).toBeVisible();
  await enterPin(page, WRONG_PIN);
  await expect(page.getByText("Not quite, try again")).toBeVisible();
  // Mirroring safety: the pad shows dots, never the digits typed.
  await expect(page.getByTestId("pin-dots")).not.toContainText(/\d/);

  await enterPin(page, PIN);
  await expect(page.getByRole("heading", { name: "Teacher's corner" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await expect(keys).toBeHidden();

  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(keys).toBeVisible();
  await page.reload();
  await expect(keys).toBeVisible();
});

test("admin: paste 24 students and add a holiday, reload: both are still there", async ({ page, api }) => {
  await api.unlockAdmin();
  const countsFrom = addDays(today(), 32);
  const holiday = { label: "Autumn break", start: addDays(today(), 40), end: addDays(today(), 44) };

  await page.goto("/admin/students");
  await expect(page.getByText(/^24 in the class\./)).toBeVisible();

  await page.getByRole("button", { name: "Add students" }).click();
  const dialog = page.getByRole("dialog", { name: "Add students" });
  await dialog.getByLabel("Names").fill(NEW_CLASS.join("\n"));
  await dialog.getByLabel("Counts from").fill(countsFrom);
  await dialog.getByRole("button", { name: "Add 24 students" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("24 students joined the class!")).toBeVisible();
  await expect(page.getByText(/^48 in the class\./)).toBeVisible();

  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL(/\/admin\/calendar$/);
  await page.getByLabel("Name", { exact: true }).fill(holiday.label);
  await page.getByLabel("First day").fill(holiday.start);
  await page.getByLabel("Last day").fill(holiday.end);
  await page.getByRole("button", { name: "Add holiday" }).click();
  await expect(page.getByText(`${holiday.label} added 🏖️`)).toBeVisible();

  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: holiday.label });
  await expect(row).toContainText("5 days");

  await page.goto("/admin/students");
  await expect(page.getByText(/^48 in the class\./)).toBeVisible();
  for (const name of [NEW_CLASS[0], NEW_CLASS[23]]) {
    const input = page.getByLabel(`Name of ${name}`, { exact: true });
    await expect(input).toHaveValue(name);
    await expect(page.getByRole("listitem").filter({ has: input }).locator('input[type="date"]')).toHaveValue(countsFrom);
  }

  // The new students don't count yet, so today's lesson still shows the first 24.
  await api.startLesson(today(), "Science");
  await openLesson(page, api, today(), "Science");
  await expect(allTiles(page)).toHaveCount(24);
});

test("a student removed today leaves today's lesson", async ({ page, api }) => {
  // Review Focus 3: someone archived today no longer belongs to today's (or later) lessons.
  await api.unlockAdmin();
  await api.startLesson(today(), "Science");

  await page.goto("/admin/students");
  await page.getByRole("button", { name: "Add students" }).click();
  const dialog = page.getByRole("dialog", { name: "Add students" });
  await dialog.getByLabel("Names").fill("Nova");
  await dialog.getByRole("button", { name: "Add 1 student" }).click();
  await expect(page.getByText("Nova joined the class!")).toBeVisible();

  await openLesson(page, api, today(), "Science");
  await expect(allTiles(page)).toHaveCount(25);
  await expect(tile(page, "Nova")).toBeVisible();

  await page.goto("/admin/students");
  const nova = page.getByRole("listitem").filter({ has: page.getByLabel("Name of Nova", { exact: true }) });
  await nova.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Nova moved to Removed students")).toBeVisible();

  await openLesson(page, api, today(), "Science");
  await expect(allTiles(page)).toHaveCount(24);
  await expect(tile(page, "Nova")).toHaveCount(0);

  // The server refuses a mark for her in today's lesson too.
  const novaId = (await api.bootstrap()).students.find((s) => s.name === "Nova")?.id ?? 0;
  const refused = await api.putMark(await api.startLesson(today(), "Science"), novaId, "warning");
  expect(refused.status()).toBe(400);
});

test("admin: when the unlock runs out, the next change brings the PIN pad back", async ({ page, api }) => {
  // The server ends the unlock after 10 minutes (spec §5). Locking through the API has the same
  // effect without the wait: the page still looks unlocked until it next talks to the server.
  await api.unlockAdmin();
  await page.goto("/admin/calendar");
  await expect(page.getByRole("heading", { name: "Teacher's corner" })).toBeVisible();
  await api.lockAdmin();

  await page.getByLabel("Name", { exact: true }).fill("Snow day");
  await page.getByLabel("First day").fill(addDays(today(), 60));
  await page.getByLabel("Last day").fill(addDays(today(), 60));
  await page.getByRole("button", { name: "Add holiday" }).click();

  await expect(page.getByRole("group", { name: "PIN keys" })).toBeVisible();
  await enterPin(page, PIN);
  await expect(page).toHaveURL(/\/admin\/calendar$/);
  await expect(page.getByRole("button", { name: "Add holiday" })).toBeVisible();
  await expect(page.getByText("Snow day")).toHaveCount(0);
});
