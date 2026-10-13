# Deploying Class Points

A guide for the developer. The teacher owns the Cloudflare account; GitHub Actions deploys every push to `main` into it. Everything below fits the **Workers Free** plan ($0 a month) unless step 10 says otherwise.

You need: the GitHub repo, Node 24 and `npm install` done locally.

## 1. The teacher creates a Cloudflare account

She signs up at <https://dash.cloudflare.com/sign-up> with **her own email** and keeps the password. Then she invites you: **Manage Account → Members → Invite**, your email, role **Super Administrator** (or Administrator). Accept the invite and switch to her account in the dashboard.

## 2. Get an API token scoped to her account

In the dashboard: **My Profile → API Tokens → Create Token**.

1. Use the template **Edit Cloudflare Workers**.
2. Under **Permissions**, add **Account → D1 → Edit**.
3. Under **Account Resources**, choose **Include → her account** only. Under **Zone Resources**, choose **All zones from an account → her account**.
4. Create it and copy the token: it is shown only once.

Also copy her **Account ID** (Workers & Pages overview, right-hand side).

For the local commands in steps 3 and 4, use the token from your shell:

```sh
export CLOUDFLARE_API_TOKEN=<the token>
export CLOUDFLARE_ACCOUNT_ID=<her account id>
```

(PowerShell: `$env:CLOUDFLARE_API_TOKEN = "<the token>"`, and the same for the account id.)

## 3. Create the D1 database

```sh
npx wrangler d1 create class-points
```

Copy the printed `database_id` into `wrangler.jsonc` (replacing `00000000-0000-0000-0000-000000000000`) and commit it. The id is not a secret.

## 4. Set the setup code

The setup code unlocks first-time setup and resets a forgotten password or PIN (the app sends no email). Make it long and random, for example `node -e "console.log(crypto.randomUUID())"`.

```sh
npx wrangler secret put SETUP_CODE
```

If the Worker doesn't exist yet, Wrangler offers to create it: answer yes. Give the code to the teacher on paper and keep a copy somewhere safe. Without it she can't reset her password.

**If the code may have leaked** (for example it was shown on the classroom board, or the paper went missing), replace it straight away: run `npx wrangler secret put SETUP_CODE` again with a new random code. The old code stops working at once; nothing needs redeploying. Give her the new code on paper, then have her set a new password and PIN with it through **Forgot password?**, on a screen the class can't see. That also logs out every device, in case someone already used the old code.

## 5. Add the GitHub secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | her account id |

## 6. Push to `main`

The **Deploy** workflow lints, typechecks, runs every test, builds, applies the D1 migrations (`wrangler d1 migrations apply DB --remote`) and deploys (`wrangler deploy`). Watch it in the **Actions** tab. You can also start it by hand there (**Run workflow**).

## 7. Run setup and hand over

1. Open `https://class-points.<her-subdomain>.workers.dev` (printed at the end of the deploy log, and shown under Workers & Pages → class-points).
2. Run the setup wizard with the setup code, her name, the class name, a password, a PIN and the school days. Add her students (with a "Counts from" date if she wants to backfill).
3. Do the deploy-time checks below.
4. On her iPad: open the URL in Safari, log in, **Share → Add to Home Screen**. Give her [`TEACHER-GUIDE.md`](TEACHER-GUIDE.md) (printed) and the setup code.

### Deploy-time checks

Do these on the live URL after the first deploy, and again after adding a custom domain:

- **Login and PIN unlock work.** Passwords and PINs are hashed with PBKDF2 at 100,000 iterations, which uses a lot of CPU for one request. If logging in or unlocking admin fails with Cloudflare **error 1102 "Worker exceeded resource limits" (CPU)**, the Free plan's 10 ms CPU limit is too tight: upgrade her account to **Workers Paid** ($5 a month, Workers & Pages → Plans). Nothing else needs to change.
- **Saving works (the CSRF Origin check passes).** Start a lesson and tap a Warning: the header should say "All saved". Every change must come from the same origin as the page; a request refused with "This request came from another site." means the `Origin` the browser sends doesn't match the host the Worker sees. That happens if something in front of the Worker rewrites the host. Serve the app only from its `workers.dev` URL or a custom domain attached to the Worker (step 9), not through another proxy.
- **Security headers are there:** `curl -I https://<the url>/` shows `Content-Security-Policy`, `X-Frame-Options: DENY` and the rest from `public/_headers`.

## 8. How to restore data

**D1 Time Travel** (first choice): D1 keeps every change for the last **7 days** on the Free plan (30 on Paid) and can roll the whole database back to any minute in that window.

```sh
npx wrangler d1 time-travel info DB --timestamp=2026-10-11T08:00:00Z     # check the point you want
npx wrangler d1 time-travel restore DB --timestamp=2026-10-11T08:00:00Z  # roll back to it
```

The restore prints a bookmark you can use to undo it (`--bookmark=<bookmark>`).

**From a backup file** (older than 7 days, or a fresh database): the teacher downloads backups in **Admin → Backup**. Each file is named like `class-points-backup-2026-10-11.json`. Restore one with:

```sh
npm run restore:backup -- class-points-backup-2026-10-11.json --remote        # prints a summary, changes nothing
npm run restore:backup -- class-points-backup-2026-10-11.json --remote --yes  # replaces ALL class data
```

It replaces the settings, subjects, students, holidays, lessons and marks, and sets the teacher name from the file. Before a remote restore, run `npx wrangler d1 time-travel info DB` and note the bookmark it prints: restoring to it undoes the restore if anything goes wrong. Her password, PIN and sessions stay as they are, so the app must already be set up: on a brand-new database, run the setup wizard first, then restore. Leave out `--remote` to try it on your local database.

## 9. Optional: a custom domain

About $10 a year, for example through Cloudflare Registrar in her account.

1. Add (or buy) the domain in her Cloudflare account so it is an active zone.
2. **Workers & Pages → class-points → Settings → Domains & Routes → Add → Custom domain**, for example `points.example.com`. Cloudflare creates the DNS record and certificate.
3. Optionally make it permanent in code: add `"routes": [{ "pattern": "points.example.com", "custom_domain": true }]` to `wrangler.jsonc` and push.
4. Repeat the deploy-time checks on the new domain. Her iPad's home-screen icon points at the old URL: remove it and add it again from the new one (she logs in again there).

## 10. Costs and limits

- Workers Free: 100,000 requests a day. D1 Free: 5 GB and 5 million row reads a day. One class uses a tiny part of this.
- The only likely upgrade is Workers Paid ($5 a month) if the login CPU check in step 7 fails.
