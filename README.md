# Subscription & Bill Manager

Next.js 16 · Prisma 6 · Neon Postgres · Auth.js (credentials, bcrypt) · Tailwind v4. Same stack as rebate-app, separate database.

## First-time setup

### 1. Push to GitHub

```bash
cd "/Users/hoyee516/Claude Projects/Personal Subscription & Recurring Bill Manager/subscription-manager" && git init && git add . && git commit -m "Phase 0: scaffold, schema, auth, seed data" && git branch -M main
```

Create an empty repo `subscription-manager` on GitHub, then:

```bash
git remote add origin https://github.com/<you>/subscription-manager.git && git push -u origin main
```

### 2. Vercel project + Neon database

1. Vercel → **Add New → Project** → import `subscription-manager`. Let the first deploy fail (no env vars yet).
2. Vercel → **Storage → Create Storage → Neon** → name `subscription-manager`, region **Singapore (ap-southeast-1)** → **Connect** to the `subscription-manager` project.
3. Vercel → project → **Settings → Environment Variables** → add `AUTH_SECRET` (run `openssl rand -base64 32`).

### 3. Local env files

```bash
npm install && npx vercel link && npx vercel env pull .env.local
```

Then create `.env` (the Prisma CLI reads `.env`, Next.js reads `.env.local`) with:

- `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` = copied from `.env.local`
- `SEED_USERNAME` and `SEED_PASSWORD` = your login for this app

Copy them in the editor, not with a terminal redirect: VS Code's terminal can inject hidden characters into redirected output.

Note: in Vercel → Storage → Neon, the database must be connected to the **Development** environment too, or `vercel env pull` brings no database variables.

### 4. Create tables and load your data

```bash
npx prisma db push && npx prisma generate && npx prisma db seed
```

The seed prints counts. Expected on a fresh database: 7 payment methods, 24 items, 80 terms, 52 payments, 95 utility bills.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in, and the Overview page should show the same counts.

## Rules

- Never commit `.env` or `.env.local` (both are gitignored).
- Schema changes: `npx prisma db push && npx prisma generate`. Never `migrate dev` against the live DB.
- Every server query filters by `userId` from `requireUserId()` (`src/lib/session.ts`).

## Data corrections

The 16 seed-data questions were answered on 3 Oct 2026. `prisma/seed-data.json` now has the corrected data (for a fresh database), and `prisma/fixes/2026-10-03-corrections.ts` applies the same corrections to the existing database:

```bash
npx tsx --env-file=.env prisma/fixes/2026-10-03-corrections.ts
```

It's safe to run twice. Afterwards: 7 payment methods, 95 utility bills.

### "Charged to" card moved to the item (3 Oct 2026)

After pulling this change:

```bash
npx prisma db push && npx prisma generate && npx tsx --env-file=.env prisma/fixes/2026-10-03-item-card.ts
```

### Payment due rules (5 Oct 2026)

Each term now has a **Payment due** rule (same as start date, fixed day each month, fixed date each year, specific date, or instalments) that decides when every charge falls. The fix script sets the rules agreed on 5 Oct 2026, corrects Claude Pro to £18 on every term, and switches Google Calendar reminders off for auto-pay bills (their calendar events are removed at the next sync).

```bash
npx prisma db push && npx prisma generate && npx tsx --env-file=.env prisma/fixes/2026-10-05-due-rules.ts --dry
```

Check the list it prints, then run it again without `--dry` to apply. Safe to re-run.

## Page cache (5 Oct 2026)

Page reads are cached on the server per user (`src/lib/cache.ts`), so most page views don't touch the database:

- **Reads:** pages and loaders read through `db(userId).<model>.findMany(…)` instead of `prisma.…`. Reads inside Server Actions (checks before writing) still use `prisma` directly.
- **Writes:** every Server Action calls `dataChanged(userId)` after a successful write. **A new action that writes must do the same**, or its change won't show until the next day.
- **New day / new deploy:** the cache key includes today's date (HKT) and the deployment, so each day and each deploy start fresh.
- **Daily job (06:00 HKT):** after the calendar sync it pre-loads the main pages and every bill page, so the first open of the day is served from the cache.
- **Changed data outside the app** (a fix script, Neon console): clear the cache so the app shows it straight away:

```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "https://YOUR-APP.vercel.app/api/cron/daily?refresh=1"
```
