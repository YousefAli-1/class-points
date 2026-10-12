import { CLASS_LIST, CLASS_NAME, PASSWORD, PIN, SETUP_CODE, TEACHER, expect, test } from "./fixtures.ts";

// Runs once per project, on that project's empty database: the first-run wizard, including the
// 24 students, then saves the session for the specs (spec §8.2).

test("setup wizard: a wrong code is caught, then the class is created with 24 students", async ({ page, api }) => {
  const sessionFile = test.info().project.metadata.sessionFile as string;

  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Let's set up your class" })).toBeVisible();

  // Step 1: a wrong setup code first. The server only checks it at the end, then sends her back here.
  await page.getByLabel("Setup code").fill("not-the-code");
  await page.getByLabel("Your name").fill(TEACHER);
  await page.getByLabel("Class name").fill(CLASS_NAME);
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2: password and PIN, each typed twice.
  await expect(page.getByRole("heading", { name: "Keep it safe" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Password again").fill(PASSWORD);
  await page.getByLabel("PIN", { exact: true }).fill(PIN);
  await page.getByLabel("PIN again").fill(PIN);
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3: every weekday is a school day, so the tests can start a lesson on any date without the
  // day-off check. Then the class list, pasted in one go.
  await expect(page.getByRole("heading", { name: "Your school week" })).toBeVisible();
  for (const day of ["Fri", "Sat"]) {
    const chip = page.getByRole("button", { name: day, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByLabel("Add your students now (optional)").fill(CLASS_LIST.join("\n"));
  await expect(page.getByText("24 students. Each gets an animal avatar.")).toBeVisible();
  await page.getByRole("button", { name: /Let's go/ }).click();

  await expect(page.getByRole("heading", { name: "Let's set up your class" })).toBeVisible();
  const code = page.getByLabel("Setup code");
  await expect(code).toHaveAccessibleDescription(/isn't right/);
  await code.fill(SETUP_CODE);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Add your students now (optional)")).toHaveValue(CLASS_LIST.join("\n"));
  await page.getByRole("button", { name: /Let's go/ }).click();

  // Home: the greeting, and the class in the top bar.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: new RegExp(`^Good (morning|afternoon|evening), ${TEACHER}!$`) })).toBeVisible();
  await expect(page.getByRole("banner").getByText(CLASS_NAME)).toBeVisible();

  const { students } = await api.bootstrap();
  expect(students.map((s) => s.name)).toEqual([...CLASS_LIST]);

  await page.context().storageState({ path: sessionFile });
});
