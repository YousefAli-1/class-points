# Class Points

A behaviour points app for one teacher and her class. She marks warnings, penalties and absences on an iPad mirrored to the classroom board; every tap saves on its own. Daily, weekly and monthly reports show how the class and each child are doing.

It runs on **Cloudflare Workers + D1** (free plan): one Worker serves the React app and the `/api/*` Hono API on the same origin.

- Design spec: [`docs/superpowers/specs/2026-10-11-class-points-design.md`](docs/superpowers/specs/2026-10-11-class-points-design.md)
- Deploying for a teacher: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- The teacher's one-page guide: [`docs/TEACHER-GUIDE.md`](docs/TEACHER-GUIDE.md)

## Developer setup

You need **Node 24** and npm 11.

```sh
npm install
cp .dev.vars.example .dev.vars     # SETUP_CODE for local setup and password reset
npm run db:migrate:local           # creates the local D1 database in .wrangler/
npm run seed:local                 # optional: a demo class with a month of lessons
npm run dev                        # Vite + the Worker + local D1 at http://localhost:5173
```

The seed **replaces** everything in the local database with 24 students, 3 subjects and lessons for each school day (Sunday to Thursday) of the last 30 days. Log in with the password `teacher123`; the admin PIN is `1234`. Without the seed, open the app and run the setup wizard with the setup code from `.dev.vars`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the Cloudflare Vite plugin and a local D1 |
| `npm run build` | Typecheck, then build the client and the Worker into `dist/` |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc -b` |
| `npm test` | Unit tests (shared rules and the client, jsdom) |
| `npm run test:worker` | API integration tests in the Workers runtime (vitest-pool-workers) |
| `npm run test:all` | Both of the above |
| `npm run e2e` | Playwright (iPad landscape WebKit and desktop Chromium) |
| `npm run db:generate` | Generate a new migration from `src/worker/db/schema.ts` (drizzle-kit) |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply migrations to the local / production D1 |
| `npm run seed:local` | Replace the local data with the demo class (refuses `--remote`) |
| `npm run restore:backup -- <file.json> [--remote] --yes` | Replace all class data with a backup from Admin → Backup |
| `npm run icons` | Re-render the PNG icons from `public/icons/icon.svg` (add `-- --channel=chrome` to use an installed Chrome) |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` or the secrets |
| `npm run deploy` | Build and deploy by hand (CI normally does this) |

The vitest-pool-workers deprecation banner printed by `npm run test:worker` is known noise.

## Project layout

```
src/client/    React app (features/: auth, calendar, day, admin, reports; components/; lib/)
src/worker/    Hono API (routes/, db/, lib/)
src/shared/    Rules, Zod schemas, dates and report maths, used by both sides
migrations/    D1 SQL migrations (drizzle-kit)
public/        Web manifest, icons, security headers (_headers), robots.txt
scripts/       seed, restore-backup, make-icons
tests/         Unit, client and Worker integration tests
e2e/           Playwright tests
```

## CI/CD

- `.github/workflows/ci.yml` runs on every push and pull request: lint, typecheck, all tests and the build.
- `.github/workflows/deploy.yml` runs on pushes to `main` (or by hand): the same checks, then `wrangler d1 migrations apply DB --remote` and `wrangler deploy`. It needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (see [`docs/DEPLOY.md`](docs/DEPLOY.md)).
