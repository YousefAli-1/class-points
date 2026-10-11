# Class Points: Design Spec

- **Date:** 2026-10-11
- **Status:** Approved to build. The client asked to skip further design checkpoints and request edits after delivery.
- **Owner:** Yousef Ali (freelancer), for one teacher.

## 1. Purpose

A teacher runs a behaviour points system for her class of about 24 children across three subjects. She marks warnings and penalties during lessons on an **iPad that is mirrored to the classroom smartboard**, so the children see everything on screen. She also uses a laptop and her phone. Every change saves automatically. She can view daily, weekly and monthly reports for the whole class and for each child.

**What success looks like:** she can start using it in class the day it is handed over, with no training beyond a one-page guide. It never loses a tap, it is fun for the kids to watch, and it costs $0 a month to run.

## 2. Decisions

### Confirmed with the client
| Topic | Decision |
|---|---|
| Hosting | Online and reachable from any device. Code in a GitHub repo, auto-deployed to **Cloudflare Workers + D1** (free plan). The teacher owns the Cloudflare account. |
| Access | One teacher account (password). The admin area needs a **PIN** on top of that. |
| Configurable rules | Point values, subjects, school week, holidays / days off |
| What counts | A subject counts on a day only once its lesson is **started** (today or a past day). Each student has an **Absent** toggle, and absent students get no points. |
| Reports | On-screen summary, print / PDF, per-student report. No Excel. |
| Language | English only |
| Main device | iPad (landscape or portrait) mirrored to the smartboard. 24 students. |
| Colours | Green, dark green, white, and yellow where needed |

### Defaults chosen by the developer (easy to change after delivery)
1. **Card colours:** Warning and Penalty are both **red cards**, as the client described. Penalty is disabled until Warning is on. Turning Warning off also removes Penalty.
2. **Starting a lesson:** choosing a subject does not create the lesson by itself. The subject page shows one big **"Start lesson"** button. This stops someone browsing the dropdown from accidentally giving everyone +1. After that, every edit autosaves.
3. **Day view layout:** a grid of friendly **student tiles** instead of a plain table. It is 6 columns in landscape, 4 in portrait and 2 on a phone, so all 24 students fit on one iPad screen.
4. **Avatars:** each child gets an **animal emoji avatar** on a coloured circle, assigned automatically and changeable in admin.
5. **Point value changes** apply to lessons started from then on, because each lesson stores the values it was started with. Admin also has an "Update all past lessons too" button.
6. **Removing a student or subject archives it.** History stays in reports and it can be restored. Admin also has "Delete forever" for mistakes.
7. **Holidays and weekends** appear greyed out on the calendar. She can still start a lesson on one after a confirmation, for make-up classes.
8. **Future days** are locked.
9. **Sounds:** short cute sounds, generated in the browser so no audio files are needed. They are on by default, with a mute button in the header.
10. **Reports** are not PIN-protected by default. Admin has a "Reports need PIN" toggle for when the screen is mirrored.
11. **Admin auto-locks** after 10 minutes without admin activity.
12. **Backups:** D1 can restore to any point in the last 7 days. Admin has a "Download backup" button and shows a reminder if the last download is more than 30 days old. The repo includes a restore script for the developer.
13. **First setup** needs a secret **setup code**, stored as a Cloudflare secret. The same code resets a forgotten password or PIN, since the app sends no email.
14. **Week start** follows the school week. A week begins on the first school day after the longest run of days off: Sun–Thu starts on Sunday, Mon–Fri on Monday, Sat–Wed on Saturday.

### Out of scope
Multiple teachers or classes, Arabic / RTL, Excel export, parent or student logins, email or notifications, opening a day offline that was never loaded on that device, and a custom domain (can be added later for about $10 a year).

## 3. Architecture

```
GitHub repo (main) ──GitHub Actions──► Cloudflare Worker "class-points"
                                        ├─ Static assets: React SPA (Vite build), SPA fallback
                                        └─ /api/*  → Hono app (TypeScript) ──Drizzle──► D1 (SQLite)
```

- **One Worker** serves the built SPA as static assets (`not_found_handling: "single-page-application"`) and runs the Hono API for `/api/*` (`run_worker_first: ["/api/*"]`). Everything is on one origin, so login uses a first-party cookie that iPad Safari accepts.
- **Stack:** TypeScript everywhere.
  - Client: React 19, Vite with `@cloudflare/vite-plugin`, Tailwind CSS v4, Motion (animations), TanStack Query (server state), React Router, Radix UI primitives (Select, Dialog, Popover), canvas-confetti, Recharts, date-fns, dnd-kit (reordering), Zod.
  - Worker: Hono, Drizzle ORM (D1), Zod.
- **Shared code** (`src/shared`) holds the point rules, status transitions, Zod schemas for API payloads, school-day and week calculations, and report aggregation. Client and worker both import it, so they always agree.
- **Repo layout:**
  ```
  src/client/    React app (features/: auth, calendar, day, admin, reports; components/; lib/)
  src/worker/    Hono app (routes/, db/, lib/)
  src/shared/    rules.ts, schemas.ts, dates.ts, report.ts, types.ts
  migrations/    D1 SQL migrations (generated by drizzle-kit)
  tests/         unit (shared) + worker integration (vitest-pool-workers)
  e2e/           Playwright (WebKit iPad + Chromium)
  scripts/       seed + restore-backup
  docs/          spec, plan, DEPLOY.md, TEACHER-GUIDE.md
  ```

## 4. Domain Rules

### 4.1 Mark status
Each (lesson, student) pair has exactly one **status**:

| Status | Meaning | Points (from the lesson's snapshot) |
|---|---|---|
| `clean` | no cards (the default when no row exists) | `pointsClean` (default **+1**) |
| `warning` | Warning card | `pointsWarning` (default **0**) |
| `penalty` | Warning + Penalty cards | `pointsPenalty` (default **−1**) |
| `absent` | not in class | no points. Excluded from totals and counted as an absence. |

A single status per pair makes "penalty without warning" impossible to represent.

**Tap transitions** (`src/shared/rules.ts`):
- **Warning tap:** `clean→warning`, `warning→clean`, `penalty→clean`. Removing the Warning also removes the Penalty. Does nothing while `absent`.
- **Penalty tap:** `warning→penalty`, `penalty→warning`. From `clean` it is **rejected**: the tile shakes and a hint says "Give a warning first". Does nothing while `absent`.
- **Absent tap:** any status → `absent`, which clears the cards. `absent→clean`.

### 4.2 Lessons
- A lesson is a (date, subject) pair, unique. It is created when she taps **Start lesson**. The create call is idempotent and returns the existing lesson if there is one.
- Only today or past dates. The client uses the iPad's local date. The server rejects dates after UTC-today + 1 day.
- On creation the lesson **snapshots** `pointsClean`, `pointsWarning` and `pointsPenalty`.
- **Cancel lesson** (after a confirmation) deletes the lesson and its marks.
- Starting a lesson on a non-school weekday or a holiday is allowed after a confirmation.

### 4.3 Students
- Fields: `name` (1–40 chars, trimmed), `avatar` (emoji), `color` (palette key), `sortOrder`, `activeFrom` (date), `archivedAt` (date | null).
- **A student belongs to a lesson** when `activeFrom <= lesson.date` and (`archivedAt` is null or `lesson.date < archivedAt`).
- `activeFrom` defaults to today. The bulk-add dialog has a "Counts from" date, so she can backfill past days when she first sets up.
- Archive sets `archivedAt` to today, and restore clears it. Delete forever removes the student and their marks.
- At most 60 active students.

### 4.4 Subjects
- Fields: `name` (1–30 chars), `emoji`, `color`, `sortOrder`, `archivedAt` (timestamp | null).
- Seeded with English 📚, Mathematics 🔢 and Science 🔬.
- At least 1 active subject.
- An archived subject still appears in reports. The day-view dropdown shows active subjects plus any archived subject that has a lesson on that date.
- Delete forever is only allowed when the subject has no lessons.

### 4.5 Settings (single row)
| Field | Default / range |
|---|---|
| `teacherName`, `className` | Set during setup |
| `pointsClean` | +1, integer in −10..10 |
| `pointsWarning` | 0, integer in −10..10 |
| `pointsPenalty` | −1, integer in −10..10 |
| `schoolDays` | Weekday numbers 0=Sun … 6=Sat, chosen in setup, at least 1 |
| `soundOn` | true |
| `reportsNeedPin` | false |
| `lastBackupAt` | Timestamp or null |

The point values must satisfy `pointsClean ≥ pointsWarning ≥ pointsPenalty`.

### 4.6 Holidays
`{ id, startDate, endDate, label }` with `endDate ≥ startDate`, a span of at most 366 days, and a label of 1–40 chars.

### 4.7 Calendar day kinds
- `future`: after today
- `holiday`: inside any holiday range
- `off`: weekday not in `schoolDays`
- `school`: otherwise

`today` is a separate flag.

## 5. Security

- **Setup** (`POST /api/auth/setup`) works only while no teacher row exists. It needs `setupCode === env.SETUP_CODE`, compared in constant time. If the secret is unset, setup is disabled with a clear message.
- **Password:** at least 8 characters. **PIN:** 4–6 digits.
- **Hashing:** PBKDF2-SHA256 via WebCrypto, 100,000 iterations (the Workers maximum), 16-byte random salt, stored as `pbkdf2$<iter>$<saltB64>$<hashB64>`.
- **Sessions:**
  - The token is 32 random bytes in base64url. The database stores only its SHA-256 hash.
  - Cookie `cp_session`: HttpOnly, SameSite=Lax, Path=/, Max-Age 60 days, and Secure whenever the request is HTTPS.
  - Sliding renewal when less than 30 days remain.
- **Admin unlock:** a correct PIN sets `adminUntil = now + 10 min` on the session. Every admin request checks it and slides it forward. "Lock" clears it.
- **Brute force:** failures are counted per `kind:ip` (`CF-Connecting-IP`). Five failures lock that key for 5 minutes, doubling each time up to 1 hour. Success resets the count.
- **Reset** (`POST /api/auth/reset`) takes the setup code plus a new password and PIN. It deletes all sessions and is rate-limited.
- **CSRF:**
  - The SameSite=Lax cookie.
  - Every non-GET API request must send `Content-Type: application/json`.
  - The `Origin` header, when present, must match the request host.
- **Headers:** a strict CSP (everything self-hosted, including fonts), `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`.
- **Mirroring caution:** the PIN pad shows dots only, and its keys have no press highlight. The teacher guide tells her to unlock admin while the screen isn't shared.

## 6. API (all JSON)

Errors use the shape `{ "error": { "code": string, "message": string } }`, with statuses 400, 401, 403 (admin locked: `code: "ADMIN_LOCKED"`), 404, 409, 429 and 500. Every route except `auth/*` needs a session. "admin" marks routes that also need the PIN unlock.

| Method & path | Purpose |
|---|---|
| `GET /api/auth/status` | `{ setupDone, loggedIn, adminUnlocked, adminUntil }`. Public. |
| `POST /api/auth/setup` | `{ setupCode, teacherName, className, password, pin, schoolDays }` |
| `POST /api/auth/login` | `{ password }` |
| `POST /api/auth/logout` | Ends the session |
| `POST /api/auth/reset` | `{ setupCode, newPassword, newPin }` |
| `POST /api/auth/unlock` | `{ pin }` → admin unlocked for 10 min |
| `POST /api/auth/lock` | Locks admin |
| `POST /api/auth/password` | (admin) `{ currentPassword, newPassword }` |
| `POST /api/auth/pin` | (admin) `{ currentPin, newPin }` |
| `POST /api/auth/logout-all` | (admin) Ends every session |
| `GET /api/bootstrap` | `{ settings, subjects[], students[], holidays[] }`, including archived subjects and students |
| `PATCH /api/settings` | (admin) Partial settings |
| `POST /api/settings/recalculate` | (admin) Rewrites every lesson's point snapshot with the current values |
| `POST /api/students` | (admin) `{ names: string[], activeFrom }`. Bulk create with auto avatar and colour. |
| `PATCH /api/students/:id` | (admin) `{ name?, avatar?, color?, activeFrom? }` |
| `POST /api/students/reorder` | (admin) `{ ids: number[] }` |
| `POST /api/students/:id/archive` | (admin) Archive |
| `POST /api/students/:id/restore` | (admin) Restore |
| `DELETE /api/students/:id` | (admin) Delete forever |
| `POST /api/subjects` | (admin) `{ name, emoji, color }` |
| `PATCH /api/subjects/:id` | (admin) `{ name?, emoji?, color? }` |
| `POST /api/subjects/reorder` | (admin) |
| `POST /api/subjects/:id/archive` | (admin) |
| `POST /api/subjects/:id/restore` | (admin) |
| `DELETE /api/subjects/:id` | (admin) Only when the subject has no lessons |
| `POST /api/holidays` | (admin) `{ startDate, endDate, label }` |
| `DELETE /api/holidays/:id` | (admin) |
| `GET /api/calendar?month=YYYY-MM` | `{ lessons: [{ id, date, subjectId }] }` for the calendar dots |
| `GET /api/days/:date` | `{ date, lessons: [{ id, subjectId, pointsClean, pointsWarning, pointsPenalty, marks: { [studentId]: { status, updatedAt } } }] }` |
| `POST /api/lessons` | `{ date, subjectId }`. Idempotent create. |
| `DELETE /api/lessons/:id` | Cancel the lesson |
| `PUT /api/lessons/:lessonId/marks/:studentId` | `{ status, clientTs }`. Upsert that applies only if `clientTs >= stored updatedAt` (last write wins, safe for the offline queue). Rejects students who don't belong to the lesson. Returns the stored mark. |
| `GET /api/reports/raw?from=&to=` | `{ lessons[], marks[] }` in range. The client aggregates with `shared/report.ts`. Needs admin when `reportsNeedPin` is on. |
| `GET /api/backup` | (admin) Full JSON export of teacher-facing tables. Sets `lastBackupAt`. |

## 7. Data Model (D1 / SQLite, Drizzle)

```
teacher(id INTEGER PK CHECK(id=1), name, password_hash, pin_hash, created_at)
sessions(id_hash TEXT PK, created_at, expires_at, admin_until)
auth_attempts(key TEXT PK, failures, locked_until, lock_level)
settings(id INTEGER PK CHECK(id=1), class_name, points_clean, points_warning, points_penalty,
         school_days TEXT(JSON), sound_on, reports_need_pin, last_backup_at)
subjects(id PK, name, emoji, color, sort_order, archived_at)
students(id PK, name, avatar, color, sort_order, active_from TEXT(YYYY-MM-DD), archived_at TEXT|null, created_at)
holidays(id PK, start_date, end_date, label)
lessons(id PK, date TEXT, subject_id FK, points_clean, points_warning, points_penalty, created_at,
        UNIQUE(date, subject_id))
marks(lesson_id FK ON DELETE CASCADE, student_id FK ON DELETE CASCADE, status TEXT CHECK IN(...),
      updated_at INTEGER, PRIMARY KEY(lesson_id, student_id))
INDEX lessons(date)
```

Timestamps are epoch milliseconds (INTEGER). Calendar dates are `YYYY-MM-DD` text.

## 8. Screens and UX

### 8.1 Global
- **Layout:** a top bar with the mascot, class name and navigation pills: 📅 Calendar · 📊 Reports · 🔒 Admin. It also holds the save indicator and the sound toggle.
- **Touch:**
  - Every tap target is at least 56 px.
  - No hover-only behaviour.
  - Safe-area insets are respected.
  - It behaves well when launched from the home screen: there is a web manifest, icons, and `apple-mobile-web-app-capable`.
- **Save indicator:**
  - "All saved ✓" in green
  - "Saving…" with a spinning cloud
  - "Offline: will save when back" in yellow
  - "Couldn't save, retrying" in red, with a manual retry
- **Errors and redirects:**
  - Unexpected errors show a friendly toast. A global error boundary offers a "Reload" button.
  - A 401 goes to the login page. The save queue is kept and flushed after login.
  - `ADMIN_LOCKED` opens the PIN pad.

### 8.2 Setup, login and reset
- Friendly centred card with the mascot ("Sprout", a smiling seedling drawn as an inline SVG).
- **Setup** is a 3-step wizard:
  1. Setup code + names
  2. Password + PIN (each confirmed twice)
  3. School days (weekday chips) + optional "Add your students now"
- **Login:** one password field. A "Forgot password?" link leads to the reset form.

### 8.3 Calendar (home)
- **Greeting card:** "Good morning, {teacherName}! Today is **Sunday, 11 October**". The greeting changes with the time of day: morning, afternoon or evening. It has buttons to jump into today's subjects.
- **Month grid:**
  - Today has a yellow ring and a "Today" chip.
  - Past days with lessons show coloured dots, one per subject started.
  - Holidays have a soft yellow background, the label and 🎉.
  - Days off are greyed out. Future days are faded and locked: tapping one shows a toast, "That day hasn't come yet 🌱".
  - Month arrows and a "Today" button.
- **iPad landscape:** grid on the left (2/3) and a "Today" panel on the right (1/3) listing subjects as Start / Continue buttons. **Portrait:** stacked.
- Tapping a day opens the day view at the first active subject. A day that already has lessons opens at its first started lesson.

### 8.4 Day view (the core screen)
- **Header:**
  - ← Calendar
  - The **weekday** large and the **date** below it
  - ‹ › arrows to the previous / next day (future days are skipped)
  - The **subject dropdown**: a big pill with the subject emoji and colour, built on Radix Select
- **Not started:** an illustration and a big **"▶ Start English lesson"** button. A note appears if the day is a holiday or day off.
- **Started:** a grid of **student tiles**. Each tile has:
  - a big avatar and the name
  - two big card buttons: **Warning** 🟥 and **Penalty** 🟥 (outlined grey when off, a red filled card when on)
  - a **points badge** in the top-right corner: +1 green with a star, 0 yellow, −1 coral
  - an **Absent** toggle (🏠) in the top-left corner

  The Penalty button is faded with a small lock until Warning is on. An absent tile goes grey, shrinks slightly, shows "Absent" and disables its card buttons.
- **Footer bar:** ⭐ 20 · 🟥 3 warnings · 🟥🟥 1 penalty · 🏠 1 absent, plus a ⋯ menu with "Cancel this lesson".
- **Animations** (Motion; with `prefers-reduced-motion` only colour changes play):
  - **Card on:** the card flips in (rotateY) and drops with a spring and a little wobble; the tile does a tiny shake; "boop" sound.
  - **Card off:** the card flips out and a sparkle plays.
  - **Points change:** the number pops (scale 1.4 → 1) and crossfades colour. Going back to +1 bursts small stars.
  - **Start lesson:** tiles cascade in with a stagger and a green/yellow confetti burst plays.
  - **Rejected penalty:** a "nope" sideways shake and a speech bubble hint.
  - **Absent:** the tile desaturates and a 💤 floats up.
- **Sounds:** made with the Web Audio API: pop, boop, ding and a sparkle chime. Respects `soundOn`; the header toggle also stores a per-device preference.

### 8.5 Reports
- **Controls:**
  - A segmented control (Day | Week | Month) with a period navigator (‹ label ›)
  - Subject filter chips (All + each subject)
  - A **Print** button
- **Summary cards:** total stars earned, lessons held, warnings, penalties, absences.
- **Podium:** the top 3 by points (ties share a place). Mascot confetti only on screen, not in print.
- **Chart:** horizontal bars of total points per student, in green.
- **Table:**
  - Columns: Student | one column per subject in the filter | Total | Warnings | Penalties | Absences | Lessons attended
  - Sortable. Tapping a row opens that student's report.
- **Student report:**
  - Avatar, name and period navigator
  - Big total, then a card per subject
  - A day-by-day chart of points per day, stacked by subject
  - A list of days with cards or absences
  - Print button
- **Print CSS:** white background, navigation hidden, A4 landscape for the class report and portrait for the student report, charts kept.

### 8.6 Admin (behind the PIN)
- **PIN pad:** a modal with big round keys and dots, plus a **Lock** button in the admin header. It auto-locks after 10 minutes.
- **Tabs:** a sidebar in landscape and top tabs in portrait.
  1. **Students**
     - A list showing avatar, inline-editable name and "Counts from" date. Drag to reorder (dnd-kit).
     - An avatar picker: emoji grid plus colour swatches.
     - Remove archives the student into a collapsible "Removed students" list with Restore and Delete forever.
     - **Add students** dialog: a textarea with one name per line plus a "Counts from" date. Avatars are assigned automatically and unique.
  2. **Subjects:** the same pattern (name, emoji, colour, reorder, remove / restore).
  3. **Points:** three steppers (No cards / Warning / Warning + Penalty) with live preview tiles and an ordering check. A note reads "Applies to lessons started from now on", with an **"Also update all past lessons"** button (with confirmation).
  4. **School calendar:** weekday toggles, a holiday list and an "Add holiday" form (label, start, end).
  5. **Account:** teacher and class name, change password, change PIN, the "Reports need PIN" toggle, sound default, and "Log out all devices".
  6. **Backup:** Download backup (JSON), with the last backup date and an explanation of the 7-day restore.
- **Saving:** everything autosaves. Text saves on blur and after 600 ms of no typing. Password and PIN changes and destructive actions keep explicit buttons and confirmations.

## 9. Visual Design

- **Palette (CSS variables / Tailwind theme):**

  | Token | Hex |
  |---|---|
  | forest (dark green) | `#14532D` |
  | leaf (green) | `#22A55B` |
  | sprout (light green) | `#86E0A7` |
  | mint (background) | `#EEF9F1` |
  | white | `#FFFFFF` |
  | sunshine (yellow accent) | `#FFD23F` |
  | honey (yellow text-safe) | `#B7791F` |
  | card red (only for cards) | `#E5383B` |
  | coral (negative points) | `#F26B5B` |
  | ink (text) | `#12301F` |

  Text and background pairs meet WCAG AA.
- **Type:** **Fredoka** for headings, numbers and buttons; **Nunito** for body text. Both are self-hosted through @fontsource.
- **Shapes:** large radii (16–28 px), "chunky" buttons with a darker bottom border so they look physical and press down 2 px when tapped, soft shadows, and a subtle leaf pattern on the mint background.
- **Mascot:** "Sprout", an inline SVG seedling with a face, used on login, empty states and reports.
- **Readability from the back of the room:** student names are at least 18 px, points badges at least 28 px, and the weekday title at least 40 px on iPad.

## 10. Autosave and Offline Queue (client)

- Mark changes update the TanStack Query cache optimistically. A **save queue** keyed by `lessonId:studentId` holds only the latest state per key, with its `clientTs`, and is persisted to `localStorage`.
- **Flushes:** immediately when online, with exponential backoff up to 30 s on failure. It also flushes on the `online` event, on window focus and after login.
- **Server responses:**
  - Validation errors (400 / 404) drop the entry and refetch the day.
  - 401 pauses the queue.
- **Other mutations** (admin edits, starting or cancelling a lesson) are optimistic where cheap. On failure they roll back and show a toast.
- **Refetching:** queries refetch on window focus, so the laptop shows the iPad's edits.

## 11. Testing

- **Unit (Vitest):**
  - `rules.ts`: all transitions and points
  - `dates.ts`: day kinds, week start, holiday ranges, period ranges
  - `report.ts`: eligibility via activeFrom / archivedAt, absent excluded, archived subjects, ties on the podium
  - Client `saveQueue`: coalescing, persistence, backoff
- **Worker integration** (Vitest + `@cloudflare/vitest-pool-workers`, real D1 via Miniflare):
  - setup / login / reset / rate limit
  - admin lock enforcement
  - CRUD validation
  - lesson idempotency
  - mark eligibility and last-write-wins
  - reports-need-pin
  - backup
- **E2E** (Playwright, WebKit iPad landscape + Chromium desktop):
  - setup → add students → start lesson → toggle cards → reload → still there
  - penalty blocked without a warning
  - offline queue: go offline, tap, come back online, saved
  - admin PIN and auto-lock
  - report totals match the marks
- **Manual:** a final check in real iPad Safari before handover.

## 12. Delivery

- **GitHub:** a private repo. **GitHub Actions** runs:
  - On pull requests: typecheck, lint, unit and worker tests, build.
  - On pushes to `main`: the same checks, then `wrangler d1 migrations apply --remote` and `wrangler deploy`.

  The secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` live in GitHub. `SETUP_CODE` is a Worker secret.
- **Docs:**
  - `README.md`: developer setup
  - `docs/DEPLOY.md`: creating the Cloudflare account under the teacher's email, the D1 database, the API token, the secrets, and the first deploy
  - `docs/TEACHER-GUIDE.md`: a one-page usage guide, including Add to Home Screen and mirroring tips
- **Local dev:**
  - `npm run dev` runs Vite with the Cloudflare plugin and a local D1.
  - `npm run db:migrate:local`
  - `npm run seed:local` adds a demo class of 24 kids and a month of data.
