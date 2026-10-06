// Mortgage dates were one instalment early (checked against the BEA statement of 2 Sep 2026:
// the 19,851.48 / 12,793.02 split is the instalment due 2 Oct 2026, not 2 Sep).
// Moves every mortgage payment one month later, moves each term's start one month later
// (ending the day before the next term starts; the last term keeps its end date), and
// corrects the bill note: Sep and Oct 2021 instalments are the ones not recorded.
// Amounts, principal / interest / rate / balance and notes on payments are unchanged.
//
// Refuses to run twice: it only runs while the first payment is still dated 2 Oct 2021.
//
// Preview first (writes nothing):  npx tsx prisma/fixes/2026-10-06-mortgage-shift.ts
// Then save:                       npx tsx prisma/fixes/2026-10-06-mortgage-shift.ts --save
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SAVE = process.argv.includes("--save");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const nextMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));

async function main() {
  const items = await prisma.item.findMany({
    where: { category: { equals: "mortgage", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      notes: true,
      terms: {
        orderBy: { startDate: "asc" },
        select: { id: true, startDate: true, endDate: true, dueDate: true, payments: { orderBy: { paidAt: "asc" }, select: { id: true, paidAt: true } } },
      },
    },
  });
  if (items.length !== 1) throw new Error(`Expected exactly 1 mortgage bill, found ${items.length}`);
  const item = items[0];
  const payments = item.terms.flatMap((t) => t.payments).sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  if (!payments.length || iso(payments[0].paidAt) !== "2021-10-02") {
    console.log(`First payment is ${payments[0] ? iso(payments[0].paidAt) : "missing"}, not 2021-10-02 — already shifted? Nothing done.`);
    return;
  }

  const starts = item.terms.map((t) => nextMonth(t.startDate));
  const termUpdates = item.terms.map((t, i) => ({
    id: t.id,
    from: `${iso(t.startDate)} → ${t.endDate ? iso(t.endDate) : "open"}`,
    startDate: starts[i],
    endDate: i + 1 < starts.length ? addDays(starts[i + 1], -1) : t.endDate,
    dueDate: t.dueDate ? nextMonth(t.dueDate) : null,
  }));
  const notes = item.notes?.replace("Sep 2021 instalment not recorded.", "Sep and Oct 2021 instalments not recorded.") ?? null;

  console.log(`${item.name}: ${payments.length} payments, ${item.terms.length} terms`);
  console.log(`  payments ${iso(payments[0].paidAt)} … ${iso(payments[payments.length - 1].paidAt)}  →  ${iso(nextMonth(payments[0].paidAt))} … ${iso(nextMonth(payments[payments.length - 1].paidAt))}`);
  for (const t of termUpdates) console.log(`  term ${t.from}  →  ${iso(t.startDate)} → ${t.endDate ? iso(t.endDate) : "open"}`);
  console.log(`  note: ${notes === item.notes ? "unchanged (text not found)" : "Sep 2021 → Sep and Oct 2021 instalments not recorded"}`);

  if (!SAVE) {
    console.log("Preview only. Run again with --save to write.");
    return;
  }
  await prisma.$transaction([
    ...payments.map((p) => prisma.payment.update({ where: { id: p.id }, data: { paidAt: nextMonth(p.paidAt) } })),
    ...termUpdates.map((t) =>
      prisma.term.update({ where: { id: t.id }, data: { startDate: t.startDate, endDate: t.endDate, ...(t.dueDate ? { dueDate: t.dueDate } : {}) } }),
    ),
    prisma.item.update({ where: { id: item.id }, data: { notes } }),
  ]);
  console.log(`Shifted ${payments.length} payments and ${item.terms.length} terms by one month.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
