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

The seed prints counts. Expected: 6 payment methods, 24 items, 80 terms, 52 payments, 94 utility bills.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in, and the Overview page should show the same counts.

## Rules

- Never commit `.env` or `.env.local` (both are gitignored).
- Schema changes: `npx prisma db push && npx prisma generate`. Never `migrate dev` against the live DB.
- Every server query filters by `userId` from `requireUserId()` (`src/lib/session.ts`).

## Seed data to review — `prisma/seed-data.json`

Also listed in the file under `reviewFlags`. Edit the JSON before seeding if any of these are wrong.

1. 醫療 (Prudential, ended 2020): currency not stated — seeded as HKD.
2. 大病醫療 (Prudential, from Aug 2019): one premium row, no payments — seeded as ENDED.
3. 家務助理保險: first term spans 2 years; payment date reads "11/3/20205" — seeded as 11 Mar 2024.
4. 年金 2025: 7 instalment dates for HK$60,075.75 — last one seeded as HK$75.75.
5. 年金 2026: 6 × HK$10,000 recorded; HK$75.75 remainder has no payment.
6. "DBS" (Bupa 2021–23, 儲蓄 autopay 2021–23): card or bank account?
7. Claude Pro: source shows one month only — seeded as active monthly.
8. HKBN mobile, Claude Pro, SurfShark: no payment method.
9. Patreon: "$1,632/year ($159/month)" — seeded as HK$1,632 yearly.
10. Google One is listed as "iCloud" in Home Summary.
11. Broadband: Navigator contracts overlap (Apr–Sep 2026) — seeded as given.
12. Utilities: undated rows assigned to the month above; Electricity Nov 2022 "—" skipped.
13. Rates & Gov Rent: Apr 2024 HK$1,875 and Oct 2023 HK$3,441 look like typos.
14. Missing bills (show as "To record"): Rates Jul 2026, Water Aug 2026, Electricity Sep 2026.
15. Utility reminder lead times: not set (no payment history).
16. Card expiry dates: none in source.
