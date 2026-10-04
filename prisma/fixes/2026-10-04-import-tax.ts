// One-off import: Salaries Tax as the bill "Tax" (from the IRD Tax Position statements).
// Run once, AFTER `npx prisma db push` (adds TermInstalment):
//   npx tsx prisma/fixes/2026-10-04-import-tax.ts
// Refuses to run if a bill named "Tax" already exists.
//
// One term per year of assessment (1 Apr – 31 Mar), priced at the year's total, with its two
// instalments. Paid instalments are logged on their due dates, paid with Earnmore Credit Card.
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

const YEARS = [
  { yoa: "2023/24", start: "2023-04-01", end: "2024-03-31", shroff: "9-0182496-24-8", paid: true,
    inst: [["2025-01-13", 102593], ["2025-04-11", 29924]] as [string, number][] },
  { yoa: "2024/25", start: "2024-04-01", end: "2025-03-31", shroff: "9-1312070-25-4", paid: true,
    inst: [["2026-01-12", 142699], ["2026-04-14", 37699]] as [string, number][] },
  { yoa: "2025/26", start: "2025-04-01", end: "2026-03-31", shroff: "9-0873423-26-0", paid: false,
    inst: [["2027-01-08", 118834], ["2027-04-08", 38146]] as [string, number][] },
];

async function main() {
  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;

  if (await prisma.item.findFirst({ where: { userId, name: "Tax" } })) {
    console.log('A bill named "Tax" already exists — import skipped.');
    return;
  }
  const label = "Earnmore Credit Card";
  let card = await prisma.paymentMethod.findUnique({ where: { userId_label: { userId, label } } });
  if (!card) {
    card = await prisma.paymentMethod.create({ data: { userId, label, type: "CARD" } });
    console.log(`Added payment method "${label}"`);
  }

  const item = await prisma.item.create({
    data: {
      userId,
      name: "Tax",
      vendor: "Inland Revenue Department",
      categoryGroup: "Tax",
      category: "Salaries Tax",
      type: "POLICY",
      autoRenew: false,
      paymentMethodId: card.id,
      notes: "Salaries tax. One term per year of assessment, priced at the year's total; paid in two instalments (Jan + Apr).",
    },
  });

  for (const y of YEARS) {
    const total = y.inst.reduce((s, [, a]) => s + a, 0);
    const term = await prisma.term.create({
      data: {
        itemId: item.id,
        startDate: day(y.start),
        endDate: day(y.end),
        dueDate: day(y.inst[0][0]),
        amount: dec(total),
        currency: "HKD",
        cycleUnit: "YEAR",
        cycleCount: 1,
        notes: `Year of assessment ${y.yoa} · shroff ${y.shroff}`,
        instalments: { create: y.inst.map(([d, a]) => ({ dueDate: day(d), amountHkd: dec(a) })) },
      },
    });
    if (y.paid) {
      for (const [d, a] of y.inst) {
        await prisma.payment.create({ data: { termId: term.id, paidAt: day(d), amountHkd: dec(a), paymentMethodId: card.id } });
      }
    }
    console.log(`${y.yoa}: HK$${total.toLocaleString("en-US")} · ${y.inst.length} instalments · ${y.paid ? "paid" : "unpaid"}`);
  }
  console.log('Created "Tax".');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
