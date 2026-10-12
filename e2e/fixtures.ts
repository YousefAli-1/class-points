import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

// Shared by every E2E spec: the class that `global.setup.ts` creates, small date helpers, a typed
// API helper that seeds data through the real endpoints, and locators for the day view.
//
// Every project runs on its own database, one test at a time, and all its tests share one class
// and one logged-in session. To stay independent of the order they run in, the tests keep to lanes:
//   - English today: only `setup-and-lesson.spec.ts` (its first test starts it through the UI)
//   - Science today: the save-queue tests, and anything else that just needs a started lesson
//   - Mathematics and Science today: seeded and read by `reports.spec.ts` (it only compares)
//   - Mathematics yesterday: the calendar test (nobody in the class counts on that day yet)
// Admin tests add students who count from next month, so today's lessons keep exactly 24 tiles.
// The points test in `reports.spec.ts` changes the class's point values and always puts them back.

export const SETUP_CODE = "e2e-code";
export const PASSWORD = "sunflower-patch-7";
export const PIN = "2468";
export const TEACHER = "Ms Sara";
export const CLASS_NAME = "Class 2B";

/** Added in the setup wizard: they count from the day of the run. */
export const CLASS_LIST = [
  "Adam", "Lina", "Omar", "Sara", "Yusuf", "Maya", "Zain", "Huda",
  "Karim", "Noor", "Rami", "Leen", "Tariq", "Dana", "Fadi", "Jana",
  "Sami", "Rana", "Ali", "Mira", "Hadi", "Salma", "Ziad", "Reem",
] as const;

export type SubjectName = "English" | "Mathematics" | "Science";
export type MarkStatus = "clean" | "warning" | "penalty" | "absent";

/** `YYYY-MM-DD` for a local date (the browser runs in the same time zone as the tests). */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return isoDate(new Date());
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}

interface Named {
  id: number;
  name: string;
}
interface Bootstrap {
  settings: PointValues;
  subjects: Named[];
  students: (Named & { activeFrom: string; archivedAt: string | null })[];
}
interface Lesson {
  id: number;
  subjectId: number;
  marks: Record<string, { status: MarkStatus } | undefined>;
}

export interface PointValues {
  pointsClean: number;
  pointsWarning: number;
  pointsPenalty: number;
}

/** The values a new class starts with (spec §4.5). */
export const DEFAULT_POINTS: PointValues = { pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 };

async function json<T>(res: APIResponse, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** The real API, called with the test's own session cookie (the browser context's cookie jar). */
export class ClassApi {
  private readonly request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  async bootstrap(): Promise<Bootstrap> {
    return json(await this.request.get("/api/bootstrap"), "GET /api/bootstrap");
  }

  async subjectId(name: SubjectName): Promise<number> {
    const subject = (await this.bootstrap()).subjects.find((s) => s.name === name);
    if (!subject) throw new Error(`No subject called ${name}`);
    return subject.id;
  }

  /** Active students in class order, by name. */
  async studentIds(): Promise<Map<string, number>> {
    const { students } = await this.bootstrap();
    return new Map(students.filter((s) => s.archivedAt === null).map((s) => [s.name, s.id]));
  }

  async lessonsOn(date: string): Promise<Lesson[]> {
    return (await json<{ lessons: Lesson[] }>(await this.request.get(`/api/days/${date}`), `GET /api/days/${date}`)).lessons;
  }

  /** `POST /api/lessons` as it is: 201 when it started the lesson, 200 when it was already there. */
  async postLesson(date: string, subject: SubjectName): Promise<APIResponse> {
    return this.request.post("/api/lessons", { data: { date, subjectId: await this.subjectId(subject) } });
  }

  /** Starts (or finds: the call is idempotent) the lesson and returns its id. */
  async startLesson(date: string, subject: SubjectName): Promise<number> {
    return (await json<Lesson>(await this.postLesson(date, subject), "POST /api/lessons")).id;
  }

  async deleteLesson(lessonId: number): Promise<void> {
    // Every change is sent as JSON, even with nothing in it (spec §5, CSRF).
    await json(await this.request.delete(`/api/lessons/${lessonId}`, { data: {} }), "DELETE lesson");
  }

  async cancelLesson(date: string, subject: SubjectName): Promise<void> {
    const subjectId = await this.subjectId(subject);
    for (const lesson of await this.lessonsOn(date)) {
      if (lesson.subjectId === subjectId) await this.deleteLesson(lesson.id);
    }
  }

  /** `PUT …/marks/:studentId` as it is, stamped now unless told otherwise. */
  async putMark(lessonId: number, studentId: number, status: MarkStatus, clientTs = Date.now()): Promise<APIResponse> {
    return this.request.put(`/api/lessons/${lessonId}/marks/${studentId}`, { data: { status, clientTs } });
  }

  async setMark(lessonId: number, studentId: number, status: MarkStatus): Promise<void> {
    await json(await this.putMark(lessonId, studentId, status), "PUT mark");
  }

  /** What the server has stored for one child in one lesson (no row means clean). */
  async storedStatus(date: string, lessonId: number, name: string): Promise<MarkStatus> {
    const studentId = (await this.studentIds()).get(name);
    if (studentId === undefined) throw new Error(`No student called ${name}`);
    const lesson = (await this.lessonsOn(date)).find((l) => l.id === lessonId);
    if (!lesson) throw new Error(`No lesson ${lessonId} on ${date}`);
    return lesson.marks[studentId]?.status ?? "clean";
  }

  async unlockAdmin(): Promise<void> {
    await json(await this.request.post("/api/auth/unlock", { data: { pin: PIN } }), "POST /api/auth/unlock");
  }

  async lockAdmin(): Promise<void> {
    await json(await this.request.post("/api/auth/lock", { data: {} }), "POST /api/auth/lock");
  }

  /** (admin) The point values for lessons started from now on. */
  async setPoints(values: PointValues): Promise<void> {
    await json(await this.request.patch("/api/settings", { data: values }), "PATCH /api/settings");
  }

  /** (admin) "Also update all past lessons": every lesson takes the current point values. */
  async recalculate(): Promise<void> {
    await json(await this.request.post("/api/settings/recalculate", { data: {} }), "POST /api/settings/recalculate");
  }
}

export const test = base.extend<{ api: ClassApi }>({
  api: async ({ page }, use) => {
    await use(new ClassApi(page.request));
  },
});

export { expect };

// Day view locators

/** The tile of one student (a group named after the child). */
export function tile(page: Page, name: string): Locator {
  return page.getByRole("list", { name: "Students" }).getByRole("group", { name, exact: true });
}

export function allTiles(page: Page): Locator {
  return page.getByRole("list", { name: "Students" }).getByRole("group");
}

export function warningCard(page: Page, name: string): Locator {
  return page.getByRole("button", { name: `Warning for ${name}`, exact: true });
}

export function penaltyCard(page: Page, name: string): Locator {
  return page.getByRole("button", { name: `Penalty for ${name}`, exact: true });
}

/** The number on a tile's points sticker: "+1", "0", "−1", or "–" while absent. */
export function pointsBadge(tileLocator: Locator): Locator {
  return tileLocator.locator("span", { hasText: /^(?:[+−]\d+|0|–)$/ });
}

/** The sticker's value as a number (absent counts 0, like the reports). */
export async function pointsOf(tileLocator: Locator): Promise<number> {
  const text = (await pointsBadge(tileLocator).textContent())?.trim() ?? "";
  if (text === "–") return 0;
  const n = Number(text.replace("−", "-").replace("+", ""));
  if (!Number.isInteger(n)) throw new Error(`Unexpected points badge "${text}"`);
  return n;
}

/** The save indicator in the top bar ("All saved", "Saving…", "Offline: will save when back"). */
export function saveIndicator(page: Page): Locator {
  return page.getByRole("banner").getByRole("status");
}

/** Opens the day view on one subject and waits for the tiles. */
export async function openLesson(page: Page, api: ClassApi, date: string, subject: SubjectName): Promise<void> {
  const subjectId = await api.subjectId(subject);
  await page.goto(`/day/${date}?subject=${subjectId}`);
  await expect(allTiles(page).first()).toBeVisible();
}

/** Types a PIN on the on-screen pad (dots only, never digits). 4–5 digits need OK. */
export async function enterPin(page: Page, pin: string): Promise<void> {
  const keys = page.getByRole("group", { name: "PIN keys" });
  for (const digit of pin) await keys.getByRole("button", { name: digit, exact: true }).click();
  if (pin.length < 6) await keys.getByRole("button", { name: "OK", exact: true }).click();
}
