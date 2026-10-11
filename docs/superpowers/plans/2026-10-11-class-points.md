# Class Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship a kid-friendly classroom points web app: calendar, day view with Warning/Penalty cards and points, admin behind a PIN, reports. It runs on one Cloudflare Worker with a D1 database, and every change autosaves.

**Architecture:** One Cloudflare Worker serves the Vite-built React SPA as static assets and a Hono JSON API at `/api/*`, backed by D1 through Drizzle. Domain rules live in `src/shared` and are imported by both sides: status transitions, points, dates, report aggregation and Zod schemas. The client uses TanStack Query plus a persisted save queue for marks.

**Tech Stack:**

| Area | Packages (pinned versions) |
|---|---|
| Build and Cloudflare | vite 8.3.4, @vitejs/plugin-react 6.1.2, @cloudflare/vite-plugin 1.63.1, wrangler 4.149.0 |
| Language | typescript 5.9.3 |
| UI | react / react-dom 19.3.0, react-router 7.18.4, tailwindcss + @tailwindcss/vite 4.3.3, motion 12.43.0, radix-ui 1.7.0, sonner 2.0.8 |
| Data and API | @tanstack/react-query 5.104.1, hono 4.13.13, drizzle-orm 0.45.4, drizzle-kit 0.31.11, zod 4.x |
| Visuals | canvas-confetti 1.9.4, recharts 3.10.1 (+ react-is), @fontsource-variable/fredoka, @fontsource-variable/nunito |
| Dates and reordering | date-fns 4.4.0, @dnd-kit/core 6.3.1, @dnd-kit/sortable 10.0.0, @dnd-kit/utilities |
| Testing | vitest 4.1.11, @cloudflare/vitest-pool-workers 0.23.0, @playwright/test 1.64.0, jsdom, @testing-library/react |

**Spec:** `docs/superpowers/specs/2026-10-11-class-points-design.md`. Read it in full before starting any task; section numbers below refer to it.

## Global Constraints

- **Platform:** Node 24 locally and in CI. All code is TypeScript in strict mode, ESM (`"type": "module"`). Do not add a dependency that is not listed above without a written reason in the commit message.
- **Worker runtime:** no native Node modules, no filesystem. Use WebCrypto for crypto and the D1 binding `env.DB`.
- **Dates:**
  - Calendar dates are `YYYY-MM-DD` strings (`ISODate`).
  - Timestamps are epoch milliseconds (`number`).
  - "Today" on the client is the device's local date (`todayISO()`).
- **Copy:** English UI with a friendly, short, encouraging tone. Never shame a child in copy or animation.
- **Colour tokens** (spec §9), exactly:

  | Token | Hex |
  |---|---|
  | forest | `#14532D` |
  | leaf | `#22A55B` |
  | sprout | `#86E0A7` |
  | mint | `#EEF9F1` |
  | white | `#FFFFFF` |
  | sunshine | `#FFD23F` |
  | honey | `#B7791F` |
  | cardRed | `#E5383B` |
  | coral | `#F26B5B` |
  | ink | `#12301F` |

  Red appears only on Warning/Penalty cards and negative points.
- **Fonts:** Fredoka Variable for display, Nunito Variable for body, self-hosted through @fontsource. No external network requests from the page.
- **Accessibility and sizing:**
  - Tap targets are at least 56 px.
  - Student names are at least 18 px, points badges at least 28 px, the day title at least 40 px on iPad.
  - Respect `prefers-reduced-motion`: no movement, colour changes only.
- **Primary viewport:** iPad landscape 1180×820 and portrait 820×1180. 24 students must fit without page scroll in landscape.
- **API errors** use the shape `{ error: { code, message } }` with the codes in `ErrorCode` (Task 2).
- **Commits:** one commit per task step that says "Commit". End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Parallel work:**
  - Only stage your own files (`git add <paths>`, never `git add -A`).
  - If `git commit` fails on `index.lock`, wait 2 s and retry.
  - Do not edit files owned by another task unless your task says to.

## Review Focus

1. **Timezone edge.** The iPad's local "today" can be a day ahead of UTC. `POST /api/lessons` must accept a date of UTC-today + 1 and reject UTC-today + 2. (Task 4 test `lessons: accepts tomorrow-UTC, rejects +2`.)
2. **Out-of-order or offline writes.** A mark PUT with an older `clientTs` must not overwrite a newer stored mark. The client queue keeps only the newest state per student. (Task 4 test `marks: older clientTs ignored`; Task 5 test `saveQueue coalesces per key`.)
3. **Late joiners and removed students.** A student added today must not appear in, or earn points from, earlier lessons. A student archived today must not appear in today's or later lessons. Marks for ineligible students are rejected. (Task 2 tests `isEligible …`, `buildClassReport excludes ineligible`; Task 4 test `marks: rejects ineligible student`.)
4. **Session expires mid-lesson.** Pending taps must survive a 401 and be sent after she logs in again. (Task 5 test `saveQueue pauses on unauthorized and resumes`; Task 11 E2E `expired session keeps taps`.)
5. **Point values changed mid-term.** Lessons keep their snapshot. "Update all past lessons" rewrites the snapshots, and reports change accordingly. (Task 4 test `settings: recalculate rewrites snapshots`; Task 2 test `report uses lesson snapshot values`.)

---

## File Structure

```
package.json, vite.config.ts, wrangler.jsonc, drizzle.config.ts, tsconfig*.json, eslint.config.js,
vitest.config.ts (unit + client), vitest.workers.config.ts (worker integration), playwright.config.ts,
.gitattributes, .gitignore, .dev.vars.example, index.html
public/                manifest.webmanifest, icons, _headers
migrations/            drizzle-kit SQL (0000_init.sql …)
src/shared/            types.ts, palette.ts, rules.ts, dates.ts, report.ts, schemas.ts
src/worker/            index.ts, app.ts, db/schema.ts, db/client.ts, lib/{errors,crypto,session,rateLimit,validate}.ts,
                       routes/{auth,bootstrap,settings,students,subjects,holidays,calendar,days,lessons,reports,backup}.ts
src/client/            main.tsx, App.tsx, router.tsx, styles/index.css,
                       lib/{api,queryKeys,queries,saveQueue,SaveQueueProvider,sound,confetti,useSoundPref,format}.ts(x),
                       components/ui/*.tsx, components/layout/*.tsx, components/PinGate.tsx, components/Mascot.tsx,
                       features/auth/*, features/calendar/*, features/day/*, features/admin/*, features/reports/*
tests/shared/*.test.ts, tests/client/*.test.ts(x), tests/worker/*.test.ts
e2e/*.spec.ts
scripts/seed.ts, scripts/restore-backup.ts
docs/DEPLOY.md, docs/TEACHER-GUIDE.md, README.md
.github/workflows/ci.yml, .github/workflows/deploy.yml
```

**Ownership** (parallel tasks touch only their own paths):

| Owner | Paths |
|---|---|
| Task 1 | root config, `index.html`, `src/worker/index.ts` stub, `src/client/main.tsx` stub |
| Task 2 | `src/shared/**`, `tests/shared/**` |
| Task 3 | `src/worker/db/**`, `src/worker/lib/**`, `src/worker/app.ts`, `src/worker/index.ts`, `src/worker/routes/auth.ts`, `migrations/**`, `tests/worker/helpers.ts`, `tests/worker/auth.test.ts` |
| Task 4 | `src/worker/routes/*` except `auth.ts`, plus `tests/worker/*` except the Task 3 files; may append route mounts in `src/worker/app.ts` |
| Task 5 | `src/client/{main,App,router}.tsx`, `src/client/styles/**`, `src/client/lib/**`, `src/client/components/**`, `src/client/features/auth/**`, placeholder pages in the other features, `tests/client/{saveQueue,api}.test.ts`, `tests/client/test-utils.tsx` |
| Tasks 6, 7, 8, 9 | `src/client/features/{calendar,day,admin,reports}/**` plus their own `tests/client/{calendar,day,admin,reports}.test.tsx` |
| Task 10 | `public/**`, `scripts/**`, `docs/DEPLOY.md`, `docs/TEACHER-GUIDE.md`, `README.md`, `.github/**` |
| Task 11 | `e2e/**`, `playwright.config.ts`, plus fixes anywhere it finds bugs, reported per fix |

---

### Task 1: Scaffold and toolchain

**Files:** Create every root config listed above, plus `src/worker/index.ts` (stub), `src/client/main.tsx` (stub), `src/client/styles/index.css` (Tailwind import only), `.dev.vars.example` (`SETUP_CODE=dev-setup-code`) and `.dev.vars` (gitignored, same content).

**Interfaces:**
- **Produces npm scripts:**
  - `dev` (vite)
  - `build` (`tsc -b && vite build`)
  - `typecheck` (`tsc -b`)
  - `lint` (eslint)
  - `test` (`vitest run -c vitest.config.ts`)
  - `test:worker` (`vitest run -c vitest.workers.config.ts`)
  - `test:all` (both)
  - `e2e` (playwright)
  - `db:generate` (`drizzle-kit generate`)
  - `db:migrate:local` (`wrangler d1 migrations apply DB --local`)
  - `db:migrate:remote` (`wrangler d1 migrations apply DB --remote`)
  - `seed:local`
  - `cf-typegen` (`wrangler types`)
  - `deploy` (`npm run build && wrangler deploy`)
- **Path aliases** (tsconfig + vite): `@shared/*` → `src/shared/*`, `@client/*` → `src/client/*`, `@worker/*` → `src/worker/*`.
- **`wrangler.jsonc`:**
  - name `class-points`, `main: src/worker/index.ts`
  - `compatibility_date: "2026-10-01"`, `compatibility_flags: ["nodejs_compat"]`
  - `assets: { directory: "./dist/client", not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`
  - `d1_databases: [{ binding: "DB", database_name: "class-points", database_id: "00000000-0000-0000-0000-000000000000", migrations_dir: "migrations" }]`
  - `observability.enabled: true`
- **tsconfig projects:**
  - `tsconfig.app.json` includes `src/client`, `src/shared` (DOM libs).
  - `tsconfig.worker.json` includes `src/worker`, `src/shared` (types `worker-configuration.d.ts`).
  - `tsconfig.node.json` includes the config files and `scripts`.
  - `tsconfig.test.json` includes `tests`, `e2e`.

- [ ] **Step 1:** `npm init` the package with the pinned versions above (`"private": true, "type": "module"`) and run `npm install`. Expected: no peer-dependency errors (warnings about optional peers are fine).
- [ ] **Step 2:** Write the configs. `vitest.config.ts` defines two Vitest projects: `shared` (environment node, `tests/shared/**`) and `client` (environment jsdom, `tests/client/**`, same aliases and the react plugin). Create an empty `migrations/` dir with `.gitkeep` and make the worker test setup tolerate zero migrations. `vite.config.ts` uses `plugins: [react(), tailwindcss(), cloudflare()]` and the `resolve.alias` entries. Add `.gitattributes` (`* text=auto eol=lf`) and `.gitignore` (`node_modules`, `dist`, `.wrangler`, `.dev.vars`, `test-results`, `playwright-report`, `worker-configuration.d.ts` is **committed**).
- [ ] **Step 3:** Stubs. The worker `GET /api/health` returns `{ ok: true }`. The client renders "Class Points" with the Tailwind class `bg-mint`. Add `tests/shared/smoke.test.ts` asserting `1 + 1 === 2`, and `tests/worker/smoke.test.ts` that calls `SELF.fetch("http://x/api/health")` and expects `{ ok: true }`. Configure the workers pool from the installed `@cloudflare/vitest-pool-workers` README (its config API changed for Vitest 4; read `node_modules/@cloudflare/vitest-pool-workers/README.md` or its docs). Apply D1 migrations in a setup file via `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`, with migrations read in the config through `readD1Migrations("migrations")`.
- [ ] **Step 4:** Verify. Run `npm run cf-typegen && npm run typecheck && npm test && npm run test:worker && npm run build`. Expected: all pass, and `dist/client/index.html` exists.
- [ ] **Step 5:** Verify dev. Start `npm run dev`, then `curl localhost:5173/api/health` returns `{"ok":true}` and `/` returns HTML.
- [ ] **Step 6:** Commit `chore: scaffold vite + react + hono worker + d1 toolchain`.

---

### Task 2: Shared domain

**Files:**
- Create: `src/shared/{types,palette,rules,dates,report,schemas}.ts`
- Test: `tests/shared/{rules,dates,report,palette,schemas}.test.ts`

**Interfaces (Produces): exact exports**
```ts
// types.ts
export type ISODate = string;
export type MarkStatus = 'clean' | 'warning' | 'penalty' | 'absent';
export interface PointValues { pointsClean: number; pointsWarning: number; pointsPenalty: number }
export interface Settings extends PointValues { teacherName: string; className: string; schoolDays: number[]; soundOn: boolean; reportsNeedPin: boolean; lastBackupAt: number | null }
export interface Subject { id: number; name: string; emoji: string; color: ColorKey; sortOrder: number; archivedAt: number | null }
export interface Student { id: number; name: string; avatar: string; color: ColorKey; sortOrder: number; activeFrom: ISODate; archivedAt: ISODate | null }
export interface Holiday { id: number; startDate: ISODate; endDate: ISODate; label: string }
export interface Lesson extends PointValues { id: number; date: ISODate; subjectId: number }
export interface Mark { lessonId: number; studentId: number; status: MarkStatus; updatedAt: number }
export interface DayLesson extends Lesson { marks: Record<number, { status: MarkStatus; updatedAt: number }> }
export interface DayResponse { date: ISODate; lessons: DayLesson[] }
export interface CalendarResponse { lessons: { id: number; date: ISODate; subjectId: number }[] }
export interface Bootstrap { settings: Settings; subjects: Subject[]; students: Student[]; holidays: Holiday[] }
export interface AuthStatus { setupDone: boolean; loggedIn: boolean; adminUnlocked: boolean; adminUntil: number | null }
export interface ReportRaw { lessons: Lesson[]; marks: Mark[] }
export type ErrorCode = 'BAD_REQUEST'|'UNAUTHORIZED'|'ADMIN_LOCKED'|'NOT_FOUND'|'CONFLICT'|'RATE_LIMITED'|'SETUP_DISABLED'|'INTERNAL';
export interface ApiErrorBody { error: { code: ErrorCode; message: string; retryAfterMs?: number } }
export interface BackupFile { version: 1; exportedAt: number; settings: Settings; subjects: Subject[]; students: Student[]; holidays: Holiday[]; lessons: Lesson[]; marks: Mark[] }

// palette.ts
export const COLOR_KEYS = ['leaf','forest','sunshine','sky','berry','coral','grape','ocean','peach','lime'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export const COLORS: Record<ColorKey, { bg: string; ring: string }>;   // soft bg + darker ring, hex
export const THEME: { forest:'#14532D'; leaf:'#22A55B'; sprout:'#86E0A7'; mint:'#EEF9F1'; white:'#FFFFFF'; sunshine:'#FFD23F'; honey:'#B7791F'; cardRed:'#E5383B'; coral:'#F26B5B'; ink:'#12301F' };
export const AVATARS: readonly string[];        // exactly 40 distinct animal emoji, first 3: '🦊','🐼','🐸'
export const SUBJECT_EMOJIS: readonly string[]; // ≥ 24 school emoji incl. '📚','🔢','🔬'
export const DEFAULT_SUBJECTS: readonly { name: string; emoji: string; color: ColorKey }[];
//   = [{English,'📚','sky'}, {Mathematics,'🔢','sunshine'}, {Science,'🔬','leaf'}]
export function pickAvatars(count: number, taken: readonly string[]): { avatar: string; color: ColorKey }[];

// rules.ts
export const DEFAULT_POINTS: PointValues; // { pointsClean: 1, pointsWarning: 0, pointsPenalty: -1 }
export type MarkAction = 'warning' | 'penalty' | 'absent';
export type TransitionResult = { ok: true; status: MarkStatus } | { ok: false; reason: 'NEED_WARNING' | 'ABSENT' };
export function applyAction(current: MarkStatus, action: MarkAction): TransitionResult;
export function pointsFor(status: MarkStatus, values: PointValues): number | null;
export function hasWarningCard(s: MarkStatus): boolean;   // warning | penalty
export function hasPenaltyCard(s: MarkStatus): boolean;   // penalty
export function validatePointValues(v: PointValues): string | null;
export function isEligible(s: Pick<Student,'activeFrom'|'archivedAt'>, date: ISODate): boolean;
export function formatPoints(n: number): string;          // '+1', '0', '-1' (uses U+2212 minus: '−1')

// dates.ts
export function isValidISODate(s: string): boolean;
export function toISODate(d: Date): ISODate;              // local Y-M-D
export function parseISODate(s: ISODate): Date;           // local midnight
export function todayISO(now?: Date): ISODate;
export function addDays(date: ISODate, n: number): ISODate;
export function weekdayOf(date: ISODate): number;         // 0=Sun
export function daysBetween(a: ISODate, b: ISODate): number; // b - a in days
export type DayKind = 'future' | 'holiday' | 'off' | 'school';
export function holidayOn(date: ISODate, holidays: readonly Holiday[]): Holiday | undefined;
export function dayKind(date: ISODate, today: ISODate, schoolDays: readonly number[], holidays: readonly Holiday[]): DayKind;
export function weekStartDay(schoolDays: readonly number[]): number;
export type Period = 'day' | 'week' | 'month';
export function periodRange(period: Period, anchor: ISODate, schoolDays: readonly number[]): { from: ISODate; to: ISODate };
export function shiftPeriod(period: Period, anchor: ISODate, delta: number): ISODate;
export function periodLabel(period: Period, range: { from: ISODate; to: ISODate }): string;
export function monthGrid(month: string, weekStart: number): ISODate[][];  // month 'YYYY-MM'
export function monthOf(date: ISODate): string;           // 'YYYY-MM'
export function formatLongDate(date: ISODate): { weekday: string; full: string }; // {'Sunday','11 October 2026'}

// report.ts
export interface Tally { points: number; clean: number; warnings: number; penalties: number; absences: number; lessons: number }
export interface StudentRow extends Tally { studentId: number; attended: number; bySubject: Record<number, Tally> }
export interface ClassReport { lessonsHeld: number; rows: StudentRow[]; totals: Tally; podium: { place: 1 | 2 | 3; points: number; studentIds: number[] }[] }
export interface StudentEntry { date: ISODate; lessonId: number; subjectId: number; status: MarkStatus; points: number | null }
export interface StudentReport { row: StudentRow | null; entries: StudentEntry[]; perDay: { date: ISODate; total: number; bySubject: Record<number, number> }[] }
export function buildClassReport(input: { lessons: readonly Lesson[]; marks: readonly Mark[]; students: readonly Student[]; subjectIds?: readonly number[] }): ClassReport;
export function buildStudentReport(input: { lessons: readonly Lesson[]; marks: readonly Mark[]; student: Student; subjectIds?: readonly number[] }): StudentReport;

// schemas.ts (zod v4)
export const isoDateSchema, monthSchema, statusSchema, pinSchema /* /^\d{4,6}$/ */, passwordSchema /* 8..200 */,
  personNameSchema /* trim 1..40 */, classNameSchema /* trim 1..40 */, schoolDaysSchema /* int 0..6, unique, ≥1, sorted on parse */,
  setupSchema, loginSchema, resetSchema, unlockSchema, changePasswordSchema, changePinSchema,
  settingsPatchSchema /* partial of teacherName,className,points*,schoolDays,soundOn,reportsNeedPin; points int -10..10 */,
  studentsCreateSchema /* { names: personName[1..60], activeFrom } */, studentPatchSchema, reorderSchema /* ids int>0, 1..200, unique */,
  subjectCreateSchema /* name trim 1..30, emoji 1..16 chars, color ColorKey */, subjectPatchSchema,
  holidayCreateSchema /* end>=start, span<=366 days, label trim 1..40 */, lessonCreateSchema, markPutSchema /* { status, clientTs int>=0 } */,
  reportQuerySchema /* from,to; to>=from; span<=400 days */;
```

**Behaviour rules the tests pin:**
- **`applyAction`** follows the table in spec §4.1 exactly.
- **`weekStartDay`:**
  - Find the longest circular run of non-school weekdays. The week starts on the day after that run.
  - Ties: pick the candidate start day that comes first counting from Monday (Mon, Tue, …, Sun).
  - No days off: return 1 (Monday).
- **`periodRange`:**
  - `day` is `{anchor, anchor}`.
  - `week` starts at the latest date ≤ anchor whose weekday is `weekStartDay`, and runs 7 days.
  - `month` is the calendar month.
- **`monthGrid`:** rows of 7 starting on `weekStart`, covering the whole month with leading and trailing days from the neighbouring months. 4–6 rows.
- **`buildClassReport`:**
  - Only lessons whose `subjectId` is in `subjectIds` count (all lessons when omitted).
  - For each lesson and each student eligible on that date, the status is the mark's status, or `clean` when there is no mark.
  - `warnings` counts `warning` + `penalty`. `penalties` counts `penalty`. Points use the **lesson's snapshot**. Absent adds no points and counts in `absences`.
  - `lessons` counts eligible lessons, absences included. `attended` = lessons − absences.
  - `rows` contains only students eligible for at least one lesson, ordered by `sortOrder`.
  - The podium uses dense ranking on `points` over rows with `attended > 0`, places 1–3 only.
- **`pickAvatars`:**
  - Returns `count` items, taking unused AVATARS in list order first. Once all are taken, it cycles from the start.
  - Colours cycle through COLOR_KEYS starting at index `taken.length % 10`.

- [ ] **Step 1: Write failing tests** with these names and assertions:
  - `rules.test.ts`
    - `applyAction warning toggles`: clean→warning, warning→clean, penalty→clean
    - `applyAction penalty needs warning`: `applyAction('clean','penalty')` → `{ok:false, reason:'NEED_WARNING'}`; warning→penalty; penalty→warning
    - `applyAction absent`: clean/warning/penalty→absent; absent→clean; warning or penalty taps while absent → `{ok:false, reason:'ABSENT'}`
    - `pointsFor uses values`: with `{3,1,-2}` → clean 3, warning 1, penalty −2, absent `null`
    - `validatePointValues`: `{1,0,-1}` → null; `{0,1,-1}` → message containing "No cards"; `{1,0,11}` → message
    - `isEligible`: `{activeFrom:'2026-10-10', archivedAt:null}` on '2026-10-09' → false, on '2026-10-10' → true; `{activeFrom:'2026-09-01', archivedAt:'2026-10-11'}` on '2026-10-10' → true, on '2026-10-11' → false
    - `formatPoints`: 1→'+1', 0→'0', −1→'−1'
  - `dates.test.ts`
    - `weekStartDay`: [0,1,2,3,4]→0, [1,2,3,4,5]→1, [6,0,1,2,3]→6, [0..6]→1, [1,2,4,5]→1
    - `dayKind`: future when > today; holiday when inside a range (inclusive both ends) even if it's a school day; off when the weekday is not in schoolDays; school otherwise
    - `periodRange week`: anchor '2026-10-14' (Wed) with Sun–Thu → `{from:'2026-10-11', to:'2026-10-17'}`; with Mon–Fri → `{from:'2026-10-12', to:'2026-10-18'}`
    - `periodRange month`: '2026-02-10' → '2026-02-01'..'2026-02-28'
    - `shiftPeriod`: month −1 from '2026-03-31' → a date in February 2026; week +1 adds 7 days; day −1 subtracts 1
    - `monthGrid`: October 2026 with weekStart 0 has 5 rows, the first cell is '2026-09-27' and the last is '2026-10-31'; every row has length 7
    - `periodLabel`: day → 'Sun 11 Oct 2026'; week inside one month → '11 – 17 Oct 2026'; month → 'October 2026'
    - `formatLongDate('2026-10-11')` → `{weekday:'Sunday', full:'11 October 2026'}`
  - `report.test.ts` (fixture: 3 students with activeFrom '2026-10-01', one archived on '2026-10-06', one with activeFrom '2026-10-05'; lessons on 10-04 and 10-06 for subjects 1 and 2 with snapshot `{1,0,-1}`, one lesson with snapshot `{2,1,-1}`)
    - `defaults to clean when no mark`
    - `report uses lesson snapshot values`
    - `buildClassReport excludes ineligible` (late joiner absent from 10-04 lessons; archived student absent from 10-06 lessons)
    - `absent excluded from points but counted`
    - `warnings include penalties`
    - `subject filter`
    - `podium dense ranking with ties`
    - `rows only for students with lessons`
    - `buildStudentReport perDay sums by subject`
  - `palette.test.ts`
    - `AVATARS has 40 unique`
    - `pickAvatars skips taken and cycles`
  - `schemas.test.ts`
    - `pin 4-6 digits`: '1234' and '123456' ok; '12a4' and '1234567' fail
    - `holiday end before start fails`
    - `schoolDays dedup/sort/min1`
    - `settingsPatch points range`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the modules. Use date-fns for formatting. All date maths uses local `Date` from `parseISODate` and is DST-safe: build dates from Y-M-D components, never add milliseconds.
- [ ] **Step 4:** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(shared): domain rules, dates, reports, schemas`.

---

### Task 3: Database, worker core and auth

**Files:**
- Create:
  - `src/worker/db/schema.ts`, `src/worker/db/client.ts`
  - `src/worker/lib/{errors,crypto,session,rateLimit,validate}.ts`
  - `src/worker/app.ts`, `src/worker/routes/auth.ts`
  - `migrations/0000_init.sql` (generated)
  - `tests/worker/helpers.ts`, `tests/worker/auth.test.ts`
- Modify: `src/worker/index.ts` (exports `app`)

**Interfaces:**
- Consumes: Task 2 `schemas.ts`, `types.ts`, `palette.DEFAULT_SUBJECTS`, `rules.DEFAULT_POINTS`.
- Produces:
```ts
// db/schema.ts: drizzle sqliteTable for every table in spec §7 (camelCase TS fields, snake_case columns):
//   teacher, sessions, authAttempts, settings, subjects, students, holidays, lessons, marks
// db/client.ts
export function getDb(env: { DB: D1Database }): DrizzleD1Database<typeof schema>;
export type Db = ReturnType<typeof getDb>;
// lib/errors.ts
export class AppError extends Error { status: number; code: ErrorCode; retryAfterMs?: number }
export const badRequest: (msg: string) => AppError; notFound: (what?: string) => AppError; conflict: (msg: string) => AppError;
export const unauthorized: () => AppError; adminLocked: () => AppError; rateLimited: (retryAfterMs: number) => AppError;
// lib/validate.ts
export async function parseJson<T>(c: Context, schema: ZodType<T>): Promise<T>; // throws badRequest with the first issue message
export function parseQuery<T>(c: Context, schema: ZodType<T>): T;
// lib/crypto.ts
export async function hashSecret(secret: string): Promise<string>;           // 'pbkdf2$100000$<salt b64>$<hash b64>'
export async function verifySecret(secret: string, stored: string): Promise<boolean>;
export function randomToken(): string;                                       // 32 bytes base64url
export async function sha256Hex(s: string): Promise<string>;
export function safeEqual(a: string, b: string): boolean;                    // constant-time
// lib/session.ts
export const SESSION_COOKIE = 'cp_session'; SESSION_DAYS = 60; ADMIN_MINUTES = 10;
export type AppEnv = { Bindings: Env & { SETUP_CODE?: string }; Variables: { session: SessionRow | null; db: Db } };
export const loadSession: MiddlewareHandler<AppEnv>;   // reads the cookie, validates expiry, slides renewal (<30 d left → +60 d)
export const requireAuth: MiddlewareHandler<AppEnv>;   // 401 UNAUTHORIZED
export const requireAdmin: MiddlewareHandler<AppEnv>;  // 403 ADMIN_LOCKED unless adminUntil > now; slides adminUntil = now + 10 min
export async function startSession(c: Context<AppEnv>): Promise<void>;  // inserts the row and sets the cookie (Secure when https)
export async function endSession(c: Context<AppEnv>): Promise<void>;
// lib/rateLimit.ts
export async function assertNotLocked(db: Db, key: string, now: number): Promise<void>;   // throws rateLimited
export async function recordFailure(db: Db, key: string, now: number): Promise<void>;    // 5 failures → lock 5 min * 2^level, max 60 min
export async function recordSuccess(db: Db, key: string): Promise<void>;
// app.ts
export const app: Hono<AppEnv>;  // basePath '/api'; middleware order: db → securityHeaders → csrf → loadSession; onError maps AppError/ZodError/unknown→INTERNAL
//   Mounts: app.route('/auth', authRoutes). Task 4 appends its own mounts below the marker comment `// ROUTES` and wraps them in requireAuth.
```
- **Auth routes** (spec §6, all under `/api/auth`): `status`, `setup`, `login`, `logout`, `reset`, `unlock`, `lock`, `password`, `pin`, `logout-all`.
  - `setup` inserts the teacher, the settings (with DEFAULT_POINTS and the chosen schoolDays, soundOn true, reportsNeedPin false) and the 3 DEFAULT_SUBJECTS in one `db.batch`, then starts a session.
  - When `SETUP_CODE` is unset → 503 `SETUP_DISABLED`. A second setup → 409.
  - Rate-limit keys: `login:<ip>`, `pin:<ip>`, `reset:<ip>`, `setup:<ip>`.
- **CSRF:** non-GET `/api/*` requests without `content-type: application/json` → 415 `BAD_REQUEST`. When an `Origin` header is present and doesn't match the request URL's origin → 403 `BAD_REQUEST`.

- [ ] **Step 1:** Write the schema and run `npm run db:generate`. Expected: `migrations/0000_*.sql` containing the `CHECK(id=1)` constraints, `UNIQUE(date, subject_id)`, the `CHECK` on status and `ON DELETE CASCADE` on marks. Hand-edit the SQL if drizzle cannot express a CHECK, and keep the edit.
- [ ] **Step 2:** Write failing tests in `tests/worker/auth.test.ts`, using `helpers.ts` (`api(path, init?, cookie?)`, `setupTeacher()` returning a cookie, `login()`, `unlock(cookie)`):
  - `status before setup` → `{setupDone:false, loggedIn:false}`
  - `setup rejects wrong code` → 401
  - `setup creates teacher, settings, 3 subjects and logs in`: the cookie is set; `/api/auth/status` shows `loggedIn:true`
  - `setup twice` → 409
  - `login wrong password 5x locks` → the 6th attempt gets 429 even with the correct password
  - `login ok sets HttpOnly SameSite=Lax cookie`
  - `logout clears session`
  - `unlock with wrong pin` → 401; `unlock ok` → `adminUnlocked:true`
  - `admin expires`: set `admin_until` in the past directly in the DB, then an admin route → 403 `ADMIN_LOCKED` (use `POST /api/auth/password` as the admin probe)
  - `reset with setup code replaces password and pin and kills sessions`
  - `csrf: POST without json content-type` → 415
  - `csrf: foreign Origin` → 403
  - `change password requires current`
- [ ] **Step 3:** Run `npm run test:worker`. Expected: FAIL.
- [ ] **Step 4:** Implement until it passes, then run `npm run typecheck`.
- [ ] **Step 5:** Commit `feat(worker): d1 schema, sessions, pin unlock, rate-limited auth`.

---

### Task 4: Worker data routes

**Files:**
- Create: `src/worker/routes/{bootstrap,settings,students,subjects,holidays,calendar,days,lessons,reports,backup}.ts`
- Test: `tests/worker/{bootstrap,settings,students,subjects,holidays,lessons,marks,reports,backup}.test.ts`
- Modify: `src/worker/app.ts` (mounts under `// ROUTES`)

**Interfaces:**
- Consumes: Task 3 `getDb`, `requireAuth`, `requireAdmin`, `parseJson`/`parseQuery`, errors; Task 2 schemas, `isEligible`, `pickAvatars`, `validatePointValues`.
- Produces: the HTTP contract in spec §6, with JSON shapes exactly as the Task 2 types:
  - `GET /bootstrap` → `Bootstrap`
  - `GET /days/:date` → `DayResponse`
  - `GET /calendar?month` → `CalendarResponse`
  - `GET /reports/raw` → `ReportRaw`
  - `GET /backup` → `BackupFile`
  - Mutations return the created or updated entity. Deletes return `{ ok: true }`.

**Rules the tests pin:**
- `PATCH /settings`: merge with the stored values, then `validatePointValues`. A violation → 400 with that message.
- `POST /settings/recalculate` → `{ updated: n }`, setting every lesson's snapshot to the current values.
- `POST /students` assigns avatars with `pickAvatars(n, activeAvatars)`, gives `sortOrder` continuing from the current max, and returns `Student[]`. More than 60 active students in total → 400.
- `POST /students/:id/archive` takes the body `{ date: ISODate }` (the client's local today; the server rejects dates after UTC-today + 1 like lessons) and sets `archivedAt = date`. `restore` sets it to null.
- `DELETE /subjects/:id` → 409 if the subject has lessons. Archiving the last active subject → 400.
- `POST /lessons`:
  - Validates that the subject exists and the date ≤ UTC-today + 1 (else 400 "That day hasn't come yet").
  - Idempotent: 200 with the existing lesson, or 201 for a new one, with the snapshot from settings.
  - Response type `DayLesson` (marks `{}` for new).
- `PUT /lessons/:lessonId/marks/:studentId`:
  - 404 if the lesson or student is unknown. 400 if the student is not `isEligible` on the lesson date.
  - Upserts with `ON CONFLICT DO UPDATE ... WHERE excluded.updated_at >= marks.updated_at`, where `updated_at = clientTs`.
  - Returns the stored `Mark`, which may be the newer existing one.
- `GET /reports/raw`: when `settings.reportsNeedPin` is on, apply `requireAdmin` logic → 403 `ADMIN_LOCKED`.
- `GET /backup` sets `lastBackupAt = Date.now()`.

- [ ] **Step 1:** Write the failing tests with these names and assertions:
  - `bootstrap returns settings, subjects incl archived, students incl archived, holidays`
  - `settings: rejects warning > clean`
  - `settings: recalculate rewrites snapshots`
  - `students: bulk create assigns unique avatars and sortOrder`
  - `students: reorder`
  - `students: archive/restore/delete cascades marks`
  - `students: requires admin` (403 ADMIN_LOCKED when locked)
  - `subjects: cannot delete with lessons; cannot archive last`
  - `holidays: create/delete; invalid range 400`
  - `lessons: idempotent create returns same id`
  - `lessons: snapshot taken at creation` (change settings afterwards; the lesson keeps the old values)
  - `lessons: accepts tomorrow-UTC, rejects +2`
  - `lessons: delete cascades marks`
  - `marks: upsert and read back via /days/:date`
  - `marks: older clientTs ignored` (PUT ts=200 then ts=100 → stored status from ts=200)
  - `marks: rejects ineligible student` (activeFrom after the lesson date → 400)
  - `marks: invalid status 400`
  - `calendar: lists lessons in month only`
  - `reports: raw range inclusive`
  - `reports: needs pin when reportsNeedPin`
  - `backup: contains all tables and sets lastBackupAt`
  - `all data routes 401 without session`
- [ ] **Step 2:** Run `npm run test:worker`. Expected: FAIL.
- [ ] **Step 3:** Implement the routes. Use Drizzle where it is clear and `db.run(sql\`...\`)` for the conditional upsert. Mark mutation routes `requireAdmin` except lessons, marks, days, calendar, bootstrap and reports.
- [ ] **Step 4:** Run `npm run test:worker && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(worker): students, subjects, settings, holidays, lessons, marks, reports, backup`.

---

### Task 5: Client foundation

**Files:**
- Create: `src/client/{main,App,router}.tsx`, `src/client/styles/index.css`, `src/client/lib/*`, `src/client/components/**`, `src/client/features/auth/{SetupPage,LoginPage,ResetPage}.tsx`
- Create placeholder pages (one default export each, rendering a heading), which Tasks 6–9 replace:
  - `features/calendar/CalendarPage.tsx`
  - `features/day/DayPage.tsx`
  - `features/admin/AdminPage.tsx`
  - `features/reports/ReportsPage.tsx`
  - `features/reports/StudentReportPage.tsx`
- Test: `tests/client/saveQueue.test.ts`, `tests/client/api.test.ts`

**Interfaces (Produces): feature tasks rely on exactly these**
```ts
// lib/api.ts
export class ApiError extends Error { status: number; code: ErrorCode | 'NETWORK'; retryAfterMs?: number }
export const api: {
  authStatus(): Promise<AuthStatus>; setup(b): Promise<void>; login(password: string): Promise<void>; logout(): Promise<void>;
  reset(b): Promise<void>; unlock(pin: string): Promise<void>; lock(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>; changePin(currentPin: string, newPin: string): Promise<void>; logoutAll(): Promise<void>;
  bootstrap(): Promise<Bootstrap>; patchSettings(p: Partial<Settings>): Promise<Settings>; recalculate(): Promise<{ updated: number }>;
  createStudents(names: string[], activeFrom: ISODate): Promise<Student[]>; patchStudent(id: number, p: Partial<Pick<Student,'name'|'avatar'|'color'|'activeFrom'>>): Promise<Student>;
  reorderStudents(ids: number[]): Promise<void>; archiveStudent(id: number, date: ISODate): Promise<Student>; restoreStudent(id: number): Promise<Student>; deleteStudent(id: number): Promise<void>;
  createSubject(b: { name: string; emoji: string; color: ColorKey }): Promise<Subject>; patchSubject(id: number, p: Partial<Pick<Subject,'name'|'emoji'|'color'>>): Promise<Subject>;
  reorderSubjects(ids: number[]): Promise<void>; archiveSubject(id: number): Promise<Subject>; restoreSubject(id: number): Promise<Subject>; deleteSubject(id: number): Promise<void>;
  createHoliday(b: { startDate: ISODate; endDate: ISODate; label: string }): Promise<Holiday>; deleteHoliday(id: number): Promise<void>;
  calendar(month: string): Promise<CalendarResponse>; day(date: ISODate): Promise<DayResponse>;
  createLesson(date: ISODate, subjectId: number): Promise<DayLesson>; deleteLesson(id: number): Promise<void>;
  putMark(lessonId: number, studentId: number, status: MarkStatus, clientTs: number): Promise<Mark>;
  reportRaw(from: ISODate, to: ISODate): Promise<ReportRaw>; backup(): Promise<BackupFile>;
};
// lib/queryKeys.ts
export const qk = { auth: ['auth'], bootstrap: ['bootstrap'], day: (d: ISODate) => ['day', d], calendar: (m: string) => ['calendar', m], report: (f: ISODate, t: ISODate) => ['report', f, t] } as const;
// lib/queries.ts
export function useAuthStatus(): UseQueryResult<AuthStatus>;
export function useBootstrap(): UseQueryResult<Bootstrap>;   // staleTime 60 s
export function useDay(date: ISODate): UseQueryResult<DayResponse>;  // data merged with pending queue marks for that date
export function useCalendar(month: string): UseQueryResult<CalendarResponse>;
export function useReportRaw(from: ISODate, to: ISODate, enabled?: boolean): UseQueryResult<ReportRaw>;
export function useToday(): ISODate;  // re-renders at local midnight
// lib/saveQueue.ts (framework-free, unit tested)
export interface QueuedMark { lessonId: number; studentId: number; status: MarkStatus; clientTs: number; date: ISODate }
export type SendResult = 'ok' | 'drop' | 'retry' | 'unauthorized';
export type SaveState = 'saved' | 'saving' | 'offline' | 'error';
export class SaveQueue {
  constructor(o: { storage: Pick<Storage,'getItem'|'setItem'>; send: (m: QueuedMark) => Promise<SendResult>; now?: () => number;
                   isOnline?: () => boolean; schedule?: (fn: () => void, ms: number) => unknown; onChange?: () => void });
  enqueue(m: Omit<QueuedMark,'clientTs'>): QueuedMark;  // clientTs = max(now(), lastTs+1); coalesce by `${lessonId}:${studentId}`; persist key 'cp.saveQueue.v1'
  flush(): Promise<void>; pause(): void; resume(): void; pendingFor(date: ISODate): QueuedMark[];
  readonly state: SaveState; readonly size: number;
}
// lib/SaveQueueProvider.tsx
export function SaveQueueProvider(p: { children: ReactNode }): JSX.Element;
export function useSaveQueue(): { enqueueMark(date: ISODate, lessonId: number, studentId: number, status: MarkStatus): void; state: SaveState; pending: number; retryNow(): void };
//   enqueueMark also writes the optimistic mark into the qk.day(date) cache.
//   send maps: 2xx→ok; ApiError 400/404/409→drop (+ invalidate the day); 401→unauthorized (pause; queue kept; resumes after login); else→retry.
// lib/sound.ts
export type SoundName = 'pop' | 'boop' | 'ding' | 'sparkle' | 'nope' | 'whoosh';
export function playSound(name: SoundName): void;   // Web Audio synthesis, lazily creates the AudioContext on first user gesture
export function useSound(): (name: SoundName) => void;  // no-op when muted (per-device pref 'cp.sound' overrides settings.soundOn)
export function useSoundPref(): [on: boolean, toggle: () => void];
// lib/confetti.ts
export function celebrate(kind: 'start' | 'podium' | 'small', origin?: { x: number; y: number }): void; // skipped when reduced motion
// lib/format.ts
export function greeting(now?: Date): 'Good morning' | 'Good afternoon' | 'Good evening';
// lib/useReducedMotion.ts — re-export motion's useReducedMotion
// components/ui: each a named export from 'components/ui/index.ts'
export function Button(p: ButtonHTMLAttributes & { variant?: 'primary'|'secondary'|'sunny'|'danger'|'ghost'; size?: 'md'|'lg'|'xl'; icon?: ReactNode; loading?: boolean }): JSX.Element;
export function IconButton(p: ButtonHTMLAttributes & { label: string; icon: ReactNode; variant?: ...; size?: 'md'|'lg' }): JSX.Element;
export function Card(p: HTMLAttributes<HTMLDivElement>): JSX.Element;
export function Modal(p: { open: boolean; onOpenChange(o: boolean): void; title: string; description?: string; children: ReactNode; wide?: boolean }): JSX.Element;
export function ConfirmDialog(p: { open: boolean; onOpenChange(o: boolean): void; title: string; description: string; confirmLabel: string; tone?: 'danger'|'primary'; onConfirm(): void | Promise<void> }): JSX.Element;
export function SelectPill(p: { value: string; onValueChange(v: string): void; ariaLabel: string; options: { value: string; label: string; emoji?: string; color?: ColorKey; hint?: string }[] }): JSX.Element;
export function SegmentedControl<T extends string>(p: { value: T; onChange(v: T): void; options: { value: T; label: string }[]; ariaLabel: string }): JSX.Element;
export function Chip(p: { selected?: boolean; onClick?(): void; color?: ColorKey; children: ReactNode }): JSX.Element;
export function Toggle(p: { checked: boolean; onChange(v: boolean): void; label: string; description?: string }): JSX.Element;
export function Stepper(p: { value: number; onChange(v: number): void; min: number; max: number; label: string; format?(n: number): string }): JSX.Element;
export function TextField(p: InputHTMLAttributes & { label: string; error?: string; hint?: string }): JSX.Element;
export function DateField(p: { value: ISODate; onChange(v: ISODate): void; label: string; max?: ISODate }): JSX.Element;
export function Avatar(p: { emoji: string; color: ColorKey; size?: 'sm'|'md'|'lg'|'xl'; dimmed?: boolean }): JSX.Element;
export function Spinner(p: { size?: number }): JSX.Element;
export function EmptyState(p: { mood?: MascotMood; title: string; children?: ReactNode; action?: ReactNode }): JSX.Element;
// components/Mascot.tsx
export type MascotMood = 'happy' | 'wave' | 'cheer' | 'sleep' | 'think';
export function Mascot(p: { mood?: MascotMood; size?: number; className?: string }): JSX.Element;  // inline SVG seedling "Sprout"
// components/PinGate.tsx
export function PinGate(p: { title: string; subtitle?: string; onUnlocked?(): void }): JSX.Element;  // PinPad + api.unlock + invalidate qk.auth; shows the lockout countdown on 429
//   PinPad (inside PinGate): big round keys 0-9, ⌫, OK; shows filled dots only, never digits; keys have NO pressed highlight/animation
//   (mirroring safety, spec §5); wrong PIN → dots shake + "Not quite, try again"; auto-submits at 6 digits, OK button for 4–5.
// components/layout
export function AppShell(): JSX.Element;      // TopBar + <Outlet/>; mint leaf-pattern background
export function TopBar(): JSX.Element;        // Sprout + className, nav pills (Calendar /, Reports /reports, Admin /admin), SaveIndicator, sound toggle
export function SaveIndicator(): JSX.Element;
export function RequireAuth(p: { children: ReactNode }): JSX.Element;  // !setupDone→/setup, !loggedIn→/login
export function RouteError(): JSX.Element;    // friendly error screen with Reload
```
- **Router paths:**
  - `/setup`, `/login`, `/reset` (public)
  - Inside `RequireAuth` + `AppShell`:
    - `/` → CalendarPage
    - `/day/:date` → DayPage
    - `/reports` → ReportsPage
    - `/reports/student/:id` → StudentReportPage
    - `/admin/*` → AdminPage
  - Feature pages are default exports loaded with `React.lazy`.
- **Query client:** `refetchOnWindowFocus: true`, `retry: 1`. A global `QueryCache.onError` / `MutationCache.onError` handler: 401 → invalidate `qk.auth`; `ADMIN_LOCKED` → invalidate `qk.auth`; other errors → `toast.error(friendly message)`, except mutations with `meta.silent`.
- **Styles:**
  - A Tailwind v4 `@theme` with the colour tokens (`--color-forest`, …), `--font-display`, `--font-body`, radii and chunky button shadow utilities.
  - `@media print` base rules: white background, hide `[data-print-hide]`.
  - `html { -webkit-tap-highlight-color: transparent }` and `touch-action: manipulation` on buttons.
  - Safe-area padding.
- **Setup wizard and login:** as spec §8.2. The wizard posts `api.setup`. Step 3's optional student list calls `api.createStudents(names, today)`. Login shows "Too many tries, wait N min" on 429.

- [ ] **Step 1: Write failing tests** with these names and assertions:
  - `saveQueue.test.ts`
    - `coalesces per key` (two enqueues for the same key → size 1, newest status)
    - `clientTs strictly increases even when now() is constant`
    - `persists and restores from storage`
    - `retry uses backoff and keeps the entry`
    - `drop removes the entry`
    - `pauses on unauthorized and resumes` (no sends while paused; flush after resume sends the entry)
    - `offline state when isOnline false`
    - `pendingFor filters by date`
  - `api.test.ts` (mock fetch)
    - `throws ApiError with code from body`
    - `network failure → code NETWORK`
    - `sends credentials and json content-type on POST`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `lib/*` until the unit tests pass.
- [ ] **Step 4:** Implement styles, UI kit, Mascot, PinGate, layout, router, auth pages and placeholder feature pages. Run `npm run dev`, set up a teacher with code `dev-setup-code`, and log in. Expected: the Calendar placeholder renders inside the shell, nav pills work, and the save indicator shows "All saved".
- [ ] **Step 5:** Run `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(client): design system, api client, save queue, shell and auth pages`.

---

### Task 6: Calendar page

**Files:** `src/client/features/calendar/**` (`CalendarPage.tsx` default export, plus `MonthGrid.tsx`, `DayCell.tsx`, `TodayPanel.tsx`)

**Interfaces:**
- Consumes:
  - `useBootstrap`, `useCalendar`, `useDay`, `useToday`, `api.createLesson`
  - `dates.monthGrid`, `dayKind`, `weekStartDay`, `holidayOn`, `monthOf`, `formatLongDate`
  - `greeting`, UI kit, `Mascot`, `toast`
- Produces: the route `/` with query `?month=YYYY-MM` (defaults to today's month).

**Behaviour:** as spec §8.3.
- Weekday headers start at `weekStartDay(settings.schoolDays)`.
- A cell shows one dot per subject that has a lesson that date, in the subject colour, ordered by `sortOrder`.
- Tapping a day navigates to `/day/:date`, except future days, which show a toast: "That day hasn't come yet 🌱".
- The Today panel lists active subjects with "Start" (calls `createLesson`, then navigates to `/day/:today?subject=id`) or "Continue" when that lesson already exists.
- Cells are at least 64 px tall on iPad. Days outside the month are dimmed.
- Motion: the month slides left or right when changing month (`AnimatePresence`, direction-aware).

- [ ] **Step 1:** Implement. Add `tests/client/calendar.test.tsx` (Testing Library + jsdom, with the queries mocked through a `QueryClient` seeded via `setQueryData`):
  - `renders today ring and holiday label`
  - `future day click shows toast and does not navigate`
- [ ] **Step 2:** Run `npm test && npm run typecheck`. Then, with `npm run dev`, check visually at 1180×820 and 820×1180: no horizontal scroll, today highlighted.
- [ ] **Step 3:** Commit `feat(calendar): month calendar with lesson dots, holidays and today panel`.

---

### Task 7: Day view (the core screen)

**Files:** `src/client/features/day/**`:
- `DayPage.tsx` (default)
- `DayHeader.tsx`
- `StartLessonPanel.tsx`
- `StudentGrid.tsx`
- `StudentTile.tsx`
- `CardButton.tsx`
- `PointsBadge.tsx`
- `DayFooter.tsx`
- `useDayModel.ts`

**Interfaces:**
- Consumes:
  - `useBootstrap`, `useDay`, `useToday`, `useSaveQueue().enqueueMark`, `api.createLesson`, `api.deleteLesson`, `qk`
  - `rules.applyAction`, `pointsFor`, `isEligible`, `hasWarningCard`, `hasPenaltyCard`, `formatPoints`
  - `dates.dayKind`, `formatLongDate`, `addDays`
  - `useSound`, `celebrate`, UI kit (`SelectPill`, `ConfirmDialog`, `IconButton`, `Avatar`, `EmptyState`)
- Produces: the route `/day/:date?subject=:id`.
- `useDayModel(date)` returns:
  ```ts
  { subjects: Subject[]; subjectId: number; setSubjectId(id): void; lesson: DayLesson | null; students: Student[]; statusOf(studentId): MarkStatus;
    act(studentId, action: MarkAction): TransitionResult; startLesson(): Promise<void>; cancelLesson(): Promise<void>; kind: DayKind; counts: { clean; warnings; penalties; absent } }
  ```

**Behaviour:** spec §8.4 exactly.
- **Subject list:** active subjects, plus archived subjects that have a lesson on that date.
- **Default subject:** the `?subject` param, or else the first subject with a lesson that day, or else the first active subject. Changing it updates the URL (replace).
- **Students shown:** `isEligible` on that date, ordered by `sortOrder`.
- **Future dates:** redirect to `/`.
- **Header arrows:** move by 1 day, disabled when the next day would be in the future.
- **`act`:**
  1. Calls `applyAction`.
  2. On `ok`, calls `enqueueMark` and plays a sound (warning on → `boop`; penalty on → `boop`; card removed → `sparkle`; absent → `whoosh`; present again → `pop`).
  3. On `NEED_WARNING`, triggers the tile's "nope" shake, plays `nope`, and shows the bubble "Give a warning first".
- **Start lesson:** if `kind` is `off` or `holiday`, show a ConfirmDialog ("Today is a day off. Start a lesson anyway?") first. After creation, run the stagger-in animation of tiles and `celebrate('start')`.
- **Cancel lesson:** from the footer ⋯ menu, with ConfirmDialog tone danger.
- **Grid:**
  - CSS grid: `grid-cols-2` on phone, `md:grid-cols-4` on iPad portrait, `lg:grid-cols-6` on iPad landscape.
  - Tile height is chosen so 4 rows fit in 1180×820 under the header and footer.
  - Tile content: avatar `lg`, name (18 px+, truncated with a title), absent toggle top-left, PointsBadge top-right, two CardButtons side by side (64×80 px, card shape with rounded 10 px corners, label underneath).
- **CardButton states:** `off` (dashed grey outline, card icon), `on` (cardRed fill with white shine, flips in), `locked` (Penalty without a warning: 40% opacity and a small 🔒; still tappable so it can show the hint).
- **PointsBadge:** a circle of at least 56 px. +N uses leaf with a ⭐ in the corner, 0 uses sunshine with ink text, −N uses coral with white text, and absent shows "–" in grey. The value animates with a pop (key on the value).
- **Animations:** Motion `layout` on tiles, springs `{ type: 'spring', stiffness: 500, damping: 22 }`, card flip `rotateY: 90 → 0`, nope shake `x: [0,-10,10,-6,6,0]`. Use `useReducedMotion` to switch transforms off.
- **Accessibility:**
  - CardButtons are `button` elements with `aria-pressed` and aria-labels: "Warning for {name}", "Penalty for {name}".
  - The absent toggle is labelled "Mark {name} absent" / "Mark {name} present".

- [ ] **Step 1:** Write failing tests in `tests/client/day.test.tsx` (seeded QueryClient, `SaveQueueProvider` with a fake send):
  - `penalty without warning shows hint and does not enqueue`
  - `warning then penalty enqueues penalty and badge shows −1`
  - `removing warning clears penalty (badge +1)`
  - `absent dims tile and disables cards`
  - `not-started subject shows Start button`
  - `ineligible students hidden`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement until it passes. Run `npm run typecheck`.
- [ ] **Step 4:** Visual check with `npm run dev` and 24 seeded students at 1180×820. Everyone is visible without scrolling. Tapping produces the animations and sounds.
- [ ] **Step 5:** Commit `feat(day): student tiles with animated warning/penalty cards and autosave`.

---

### Task 8: Admin

**Files:** `src/client/features/admin/**`:
- `AdminPage.tsx` (default; PIN gate + tab layout + nested routes)
- `StudentsTab.tsx`, `AddStudentsDialog.tsx`, `AvatarPicker.tsx`
- `SubjectsTab.tsx`, `PointsTab.tsx`, `CalendarTab.tsx`, `AccountTab.tsx`, `BackupTab.tsx`
- `useAutosaveField.ts`, `mutations.ts`, `SortableList.tsx`

**Interfaces:**
- Consumes:
  - `useAuthStatus`, `useBootstrap`, `api.*` admin functions, `qk`, `PinGate`, UI kit
  - `palette.AVATARS`, `COLORS`, `COLOR_KEYS`, `SUBJECT_EMOJIS`
  - `rules.validatePointValues`, `DEFAULT_POINTS`; `dates.todayISO`
- Produces: the routes `/admin/students` (index redirect), `/admin/subjects`, `/admin/points`, `/admin/calendar`, `/admin/account`, `/admin/backup`.
- `useAutosaveField<T>(value: T, save: (v: T) => Promise<unknown>, opts?: { delayMs?: number /* 600 */; validate?(v: T): string | null })` returns `{ draft, setDraft, error, status: 'idle'|'saving'|'saved'|'error', flush() }`. It saves after 600 ms of no change and on `flush()` (call it on blur).

**Behaviour:** spec §8.6.
- **Locking:**
  - If `!adminUnlocked`, render `PinGate` (title "Teacher's corner", subtitle "Enter your PIN").
  - Header: "🔓 Unlocked" with a "Lock" button (`api.lock` + invalidate `qk.auth`).
  - A timer refetches `qk.auth` at `adminUntil`, which shows the gate again.
- **After every admin mutation:** invalidate `qk.bootstrap` and `qk.auth` (the server slides `adminUntil`).
- **Lists:** reorder with dnd-kit using a drag handle (touch sensor with a 150 ms delay), then `reorder*`.
- **Points tab:** steppers in the range −10..10. An invalid ordering shows an inline error and does not save. Preview tiles show "No cards +1", "Warning 0", "Warning + Penalty −1" with CardButton look-alikes.
- **Calendar tab:** the weekday chips Sun–Sat autosave `schoolDays`, and there must be at least 1.
- **Holidays:** sorted by start date. Past holidays sit in a collapsed "Past" group.
- **Account tab:** password and PIN forms with explicit Save buttons. Toggles for `reportsNeedPin` and `soundOn` autosave. "Log out all devices" has a ConfirmDialog.
- **Backup tab:**
  - "Download backup" calls `api.backup()` and downloads `class-points-backup-YYYY-MM-DD.json` through a Blob.
  - Shows the last backup as relative time.
  - A yellow reminder card appears when `lastBackupAt` is null or more than 30 days old.

- [ ] **Step 1:** Write tests in `tests/client/admin.test.tsx`:
  - `shows PinGate when locked`
  - `points tab blocks invalid ordering`
  - `add students dialog splits lines, trims, ignores blanks`
  - `useAutosaveField debounces 600ms and flushes on blur` (fake timers)
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement until it passes, then run `npm run typecheck`.
- [ ] **Step 4:** Manual check: add 24 students by pasting, reorder one, rename one (autosaves), remove and restore one, add a holiday, change the PIN, then lock. Each change persists across a reload.
- [ ] **Step 5:** Commit `feat(admin): pin-locked admin with students, subjects, points, calendar, account, backup`.

---

### Task 9: Reports

**Files:** `src/client/features/reports/**`:
- `ReportsPage.tsx` (default)
- `StudentReportPage.tsx` (default)
- `PeriodBar.tsx`, `SummaryCards.tsx`, `Podium.tsx`, `PointsChart.tsx`, `ReportTable.tsx`, `StudentDayChart.tsx`
- `useReportParams.ts`
- `print.css` (imported by the pages)

**Interfaces:**
- Consumes:
  - `useBootstrap`, `useAuthStatus`, `useReportRaw`, `PinGate`
  - `report.buildClassReport`, `buildStudentReport`
  - `dates.periodRange`, `shiftPeriod`, `periodLabel`, `todayISO`
  - `formatPoints`, UI kit, Recharts, `celebrate('podium')`
- Produces: `/reports` and `/reports/student/:id`.
- `useReportParams()` returns `{ period: Period, date: ISODate, subjectIds: number[] | undefined, set(p: Partial<...>): void }`, backed by the URL search params `period` (default `week`), `date` (default today) and `subjects` (comma-separated ids; absent means all).

**Behaviour:** spec §8.5.
- **PIN:** if `settings.reportsNeedPin && !adminUnlocked`, render `PinGate` (title "Reports are locked").
- **Empty period:** when no lessons fall in the period, show `EmptyState` (mood `sleep`): "No lessons in this period yet".
- **Table:**
  - Tapping a column header sorts by it (default: sortOrder).
  - Tapping a row navigates to the student report with the same params.
  - "Total" uses `formatPoints`.
- **Chart:** Recharts `BarChart` with `layout="vertical"`, leaf bars and coral bars for negative totals, names on the Y axis, height `rows × 28 + 40`.
- **Student report:**
  - `StudentDayChart` is a stacked `BarChart` per day, one series per subject in the subject colour.
  - The entries list shows only days with a warning, penalty or absence: "Mon 12 Oct · Mathematics · 🟥 Warning".
- **Print:**
  - The Print button calls `window.print()`.
  - `print.css` sets `@page { size: A4 landscape; margin: 12mm }` for the class report and portrait for the student report (scoped via a `data-print="class|student"` attribute and named pages).
  - Hides `[data-print-hide]`.
  - Keeps chart colours (`print-color-adjust: exact`).
  - Adds a print header: class name, period label, "Printed on …".

- [ ] **Step 1:** Write tests in `tests/client/reports.test.tsx`:
  - `week params default`
  - `table totals match buildClassReport`
  - `locked when reportsNeedPin`
  - `empty state when no lessons`
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement until it passes, then run `npm run typecheck`.
- [ ] **Step 4:** Visual check: with seeded data, day/week/month switching works and print preview fits A4.
- [ ] **Step 5:** Commit `feat(reports): class and student reports with podium, charts and print`.

---

### Task 10: PWA, headers, scripts, docs, CI/CD

**Files:**
- `public/manifest.webmanifest`, `public/icons/{icon.svg,icon-192.png,icon-512.png,apple-touch-icon.png}`, `public/_headers`, `public/robots.txt` (`Disallow: /`)
- `index.html` (meta tags; Task 1 created it, Task 10 may modify)
- `scripts/seed.ts`, `scripts/restore-backup.ts`
- `README.md`, `docs/DEPLOY.md`, `docs/TEACHER-GUIDE.md`
- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- **Manifest:** name "Class Points", `short_name` "Points", `display: standalone`, `background_color: #EEF9F1`, `theme_color: #14532D`, `orientation: any`.
- **`index.html`:**
  - `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=default`, `apple-touch-icon`, `theme-color`
  - viewport `width=device-width, initial-scale=1, viewport-fit=cover`
  - title "Class Points"
- **`_headers`** for `/*`:
  - `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`

  The API sets the same headers in the `securityHeaders` middleware (Task 3).
- **Icons:** the Sprout mascot on a forest rounded square. Generate the PNGs from `icon.svg` with a one-off Playwright screenshot script (`scripts/make-icons.ts`) and commit them.
- **`scripts/seed.ts`:**
  - `npm run seed:local` runs `wrangler d1 execute DB --local --file=<generated sql>` to create, through SQL INSERTs:
    - the teacher (password `teacher123`, PIN `1234`, hashed with the same PBKDF2 format: implement via WebCrypto in Node)
    - the settings (Sun–Thu)
    - the 3 subjects
    - 24 named students
    - a holiday
    - lessons for every school day of the last 30 days, with random but deterministic marks (seeded PRNG)
  - Refuses to run with `--remote`.
- **`scripts/restore-backup.ts <file.json> [--remote]`:** generates SQL that wipes the data tables and inserts the backup rows, prints a summary, and requires `--yes`.
- **`ci.yml`** (pull requests and pushes to any branch): Node 24, `npm ci`, then lint, typecheck, `test:all`, build.
- **`deploy.yml`** (push to `main`, plus `workflow_dispatch`): CI steps, then `npx wrangler d1 migrations apply DB --remote` and `npx wrangler deploy`, with the env secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- **`docs/DEPLOY.md`:** a numbered guide for the developer.
  1. The teacher creates a Cloudflare account with her email.
  2. The developer gets an API token (template "Edit Cloudflare Workers" + D1 edit) scoped to her account.
  3. `npx wrangler d1 create class-points` → paste the id into `wrangler.jsonc`.
  4. `npx wrangler secret put SETUP_CODE`.
  5. Add the GitHub secrets.
  6. Push to `main`.
  7. Open the `*.workers.dev` URL, run setup, hand over.
  8. How to restore: D1 Time Travel (`wrangler d1 time-travel restore`) and `restore-backup.ts`.
  9. Optional custom domain.
- **`docs/TEACHER-GUIDE.md`:** plain language, one page:
  - logging in and adding to the home screen on iPad
  - a daily routine (open today → pick subject → Start → tap cards)
  - what the colours and points mean
  - absent kids
  - reports and printing
  - admin and PIN (unlock when not mirroring)
  - backups
  - who to call

- [ ] **Step 1:** Implement. Run `npm run build`. Expected: `dist/client/_headers` and `manifest.webmanifest` exist.
- [ ] **Step 2:** Run `npm run db:migrate:local && npm run seed:local`, then start `npm run dev` and log in with `teacher123`. Expected: the calendar shows dots for the past 30 school days.
- [ ] **Step 3:** Validate the workflow files with `npx --yes action-validator` if available, or else by careful review. Commit `chore: pwa manifest, security headers, seed/restore scripts, docs, ci/cd`.

---

### Task 11: End-to-end tests and polish fixes

**Files:**
- `playwright.config.ts`
- `e2e/{fixtures.ts,setup-and-lesson.spec.ts,offline.spec.ts,admin.spec.ts,reports.spec.ts}`
- Fixes anywhere, each in its own commit.

**Interfaces:**
- **Projects:** `ipad` (WebKit, iPad Pro 11 landscape: `devices['iPad Pro 11 landscape']`) and `desktop` (Chromium, 1440×900).
- **`webServer`:** builds, applies migrations to a fresh local state directory (`.wrangler/e2e`), and serves the production build with a fixed `SETUP_CODE=e2e-code` (for example through `vite preview` with the Cloudflare plugin, or `wrangler dev` on the built output). Each run starts from an empty DB, and tests share one setup through a global-setup project.

**Tests:**
- `setup → add 24 students → start English lesson → warning+penalty on Lina → reload → still −1`
- `penalty blocked without warning shows hint`
- `offline: context.setOffline(true) → tap → indicator Offline → setOffline(false) → indicator All saved → reload persists`
- `expired session keeps taps`: delete the cookie, tap, see the login redirect, log in, then the tap is saved
- `admin: wrong PIN, right PIN, lock`
- `reports: week totals equal the sum of tile points for the seeded lessons`
- `24 tiles visible without scrolling on ipad`: every tile's `boundingBox().y + height` is at most the viewport height

Steps:
- [ ] **Step 1:** Write the specs and run `npm run e2e`. Expected: some fail at first. Fix the root causes (systematic debugging) and commit each fix with a test.
- [ ] **Step 2:** Run `npm run e2e`. Expected: PASS on both projects.
- [ ] **Step 3:** Commit `test(e2e): ipad + desktop flows`.

---

## Final: Whole-branch review

Run independent reviews of the whole repo against the spec, through these lenses:
1. Spec coverage
2. Correctness and edge cases (the Review Focus list)
3. Security (spec §5)
4. iPad Safari and touch UX
5. Kid-friendliness and visual polish

Fix the findings, re-run `npm run test:all && npm run e2e && npm run build`, and take screenshots of each screen at 1180×820 and 820×1180 for the client.
