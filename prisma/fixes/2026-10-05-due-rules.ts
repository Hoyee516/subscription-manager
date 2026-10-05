// Payment due rules agreed on 5 Oct 2026, Claude Pro corrected to £18, and Google Calendar
// reminders switched off for auto-pay bills.
// Run once, AFTER `npx prisma db push && npx prisma generate` (which add Term.dueRule/dueDay/dueMonth):
//   npx tsx --env-file=.env prisma/fixes/2026-10-05-due-rules.ts --dry   (shows what it would change)
//   npx tsx --env-file=.env prisma/fixes/2026-10-05-due-rules.ts         (applies it)
// Safe to re-run. Bills are found by name or vendor; anything not found, or found more than once,
// is listed and left alone so you can set it in the app (Edit term → Payment due).
import { PrismaClient, type DueRule } from "@prisma/client";

const prisma = new PrismaClient();
const dry = process.argv.includes("--dry");
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

type Rule = { dueRule: DueRule; dueDay: number | null; dueMonth: number | null };
const monthly = (day: number): Rule => ({ dueRule: "DAY_OF_MONTH", dueDay: day, dueMonth: null });
const yearly = (month: number, day: number): Rule => ({ dueRule: "DAY_OF_YEAR", dueDay: day, dueMonth: month });
const start: Rule = { dueRule: "START_DATE", dueDay: null, dueMonth: null };

// Matched against "<name> <vendor>" of main bills (riders follow their main bill).
const BILLS: { label: string; match: RegExp; rule: Rule }[] = [
  { label: "Mgt fee", match: /management|管理|mgt/i, rule: monthly(1) },
  { label: "Mortgage", match: /mortgage|按揭/i, rule: monthly(2) },
  { label: "Broadband", match: /broadband|寬頻/i, rule: monthly(15) },
  { label: "Mobile", match: /mobile|手機/i, rule: monthly(25) },
  { label: "Claude Pro", match: /claude/i, rule: monthly(24) },
  { label: "Bupa", match: /bupa/i, rule: yearly(7, 23) },
  { label: "Patreon", match: /patreon/i, rule: yearly(1, 1) },
  { label: "Norton", match: /norton/i, rule: yearly(1, 29) },
  { label: "Google One", match: /google one/i, rule: start },
  { label: "Substack", match: /substack/i, rule: start },
];

async function main() {
  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;
  if (dry) console.log("DRY RUN: nothing is saved.\n");

  const items = await prisma.item.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { terms: { orderBy: { startDate: "asc" }, include: { _count: { select: { instalments: true } } } } },
  });
  const ridersOf = (id: string) => items.filter((i) => i.parentId === id);
  const done = new Set<string>(); // term ids given a rule below

  const setRule = async (termIds: string[], rule: Rule) => {
    if (!dry && termIds.length)
      await prisma.term.updateMany({ where: { id: { in: termIds } }, data: { ...rule, dueDate: null } });
    termIds.forEach((id) => done.add(id));
  };

  // 1 · Payment due rules for the bills listed on 5 Oct 2026
  console.log("Payment due rules");
  for (const b of BILLS) {
    const hits = items.filter((i) => !i.parentId && b.match.test(`${i.name} ${i.vendor}`));
    if (hits.length !== 1) {
      console.log(
        `  ${hits.length ? "SEVERAL" : "NOT FOUND"}  ${b.label}${hits.length ? `: ${hits.map((h) => h.name).join(", ")}` : ""} — set it in the app`
      );
      continue;
    }
    const it = hits[0];
    const group = [it, ...ridersOf(it.id)];
    const terms = group.flatMap((g) => g.terms);
    const same = terms.every((t) => t.dueRule === b.rule.dueRule && t.dueDay === b.rule.dueDay && t.dueMonth === b.rule.dueMonth);
    await setRule(terms.map((t) => t.id), b.rule);
    const what =
      b.rule.dueRule === "DAY_OF_MONTH" ? `day ${b.rule.dueDay} of each month` : b.rule.dueRule === "DAY_OF_YEAR" ? `${b.rule.dueDay}/${b.rule.dueMonth} each year` : "same as start date";
    console.log(`  ${same ? "ALREADY" : "SET    "}  ${it.name} → ${what} (${terms.length} term${terms.length === 1 ? "" : "s"})`);
  }

  // 2 · Terms paid in instalments (salaries tax)
  for (const it of items) {
    const ids = it.terms.filter((t) => t._count.instalments > 0 && !done.has(t.id)).map((t) => t.id);
    if (!ids.length) continue;
    if (!dry) await prisma.term.updateMany({ where: { id: { in: ids } }, data: { dueRule: "INSTALMENTS", dueDay: null, dueMonth: null } });
    ids.forEach((id) => done.add(id));
    console.log(`  SET      ${it.name} → instalments (${ids.length} term${ids.length === 1 ? "" : "s"})`);
  }

  // 3 · Any other term with a due date different from its start keeps that date
  for (const it of items)
    for (const t of it.terms) {
      if (done.has(t.id) || t.dueRule !== "START_DATE" || !t.dueDate || t.dueDate.getTime() === t.startDate.getTime()) continue;
      if (!dry) await prisma.term.update({ where: { id: t.id }, data: { dueRule: "FIXED_DATE" } });
      console.log(`  KEPT     ${it.name} term ${ymd(t.startDate)}: specific due date ${ymd(t.dueDate)}`);
    }
  console.log("  Everything else stays on \"Same as start date\" (the default).");

  // 4 · Claude Pro is £18 a month on every term (US$25 was a data error, not a price change)
  console.log("\nClaude Pro price");
  const claude = items.filter((i) => !i.parentId && /claude/i.test(`${i.name} ${i.vendor}`));
  if (claude.length !== 1) console.log(`  ${claude.length ? "SEVERAL" : "NOT FOUND"} — set it in the app`);
  else {
    const fix = claude[0].terms.filter((t) => !(t.currency === "GBP" && Number(t.amount) === 18 && t.amountHkd === null));
    if (!dry && fix.length)
      await prisma.term.updateMany({ where: { id: { in: fix.map((t) => t.id) } }, data: { amount: 18, currency: "GBP", amountHkd: null } });
    for (const t of fix) console.log(`  SET      term ${ymd(t.startDate)}: ${t.amount} ${t.currency} → 18 GBP`);
    if (!fix.length) console.log("  ALREADY  £18 on every term");
  }

  // 5 · Auto-pay bills: Google Calendar reminder off. Their calendar events are removed
  // by the next calendar sync (daily at 06:00 HKT, or when any bill is saved).
  console.log("\nAuto-pay bills: Google Calendar reminder");
  const auto = items.filter((i) => i.autoCharge && i.remind);
  if (!dry && auto.length) await prisma.item.updateMany({ where: { id: { in: auto.map((i) => i.id) } }, data: { remind: false } });
  for (const i of auto) console.log(`  OFF      ${i.name}${i.calEventId ? " (calendar event removed at next sync)" : ""}`);
  if (!auto.length) console.log("  ALREADY  off for every auto-pay bill");

  // For reference: the cinema membership (no change; it uses "Same as start date")
  const cinema = items.filter((i) => /cinema|戲院|電影|member|會員/i.test(`${i.name} ${i.vendor} ${i.category}`));
  for (const c of cinema) console.log(`\nFound ${c.name} (${c.type}, ${c.categoryGroup} / ${c.category}): renewal alert 30 and 7 days before it ends.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
