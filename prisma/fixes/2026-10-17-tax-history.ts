// Back-fills the Salaries Tax bill (found by category Tax › Salaries Tax, not by name) with years of assessment 2010/11 – 2022/23, from the IRD salaries tax
// assessment notices in Desktop/Tax/HY (reprints issued 8 Oct 2026). 2023/24 – 2025/26 are already in
// (2026-10-04-import-tax.ts) and match the notices to the dollar.
//
// Same shape as the existing years: one term per year of assessment (1 Apr – 31 Mar), priced at the
// notice's total payable (that year's balance or refund + next year's provisional tax), with its two
// instalments. Every instalment is logged as paid on its due date, with no payment method.
//
// Run after reviewing:
//   npx tsx --env-file=.env prisma/fixes/2026-10-17-tax-history.ts --dry   (shows what it would add)
//   npx tsx --env-file=.env prisma/fixes/2026-10-17-tax-history.ts         (adds it)
// Safe to re-run: a year whose term already exists (same start date) is skipped.
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const dry = process.argv.includes("--dry");
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const hk = (n: number) => n.toLocaleString("en-US");

// From each notice: tax = tax for the year; prov = provisional tax already paid for it;
// next = next year's provisional tax. Used only to check that tax − prov + next = the two instalments.
type Year = { yoa: string; tax: number; prov: number; next: number; inst: [string, number][] };
const YEARS: Year[] = [
  { yoa: "2010/11", tax: 24916, prov: 0,     next: 30916,  inst: [["2012-01-18", 48103], ["2012-04-20", 7729]] },
  { yoa: "2011/12", tax: 27119, prov: 30916, next: 30194,  inst: [["2013-01-22", 18848], ["2013-04-19", 7549]] },
  { yoa: "2012/13", tax: 19252, prov: 30194, next: 29167,  inst: [["2014-01-22", 10933], ["2014-04-24", 7292]] },
  { yoa: "2013/14", tax: 29003, prov: 29167, next: 38238,  inst: [["2015-01-20", 28514], ["2015-04-22", 9560]] },
  { yoa: "2014/15", tax: 26627, prov: 38238, next: 39742,  inst: [["2016-01-21", 18195], ["2016-04-21", 9936]] },
  { yoa: "2015/16", tax: 31265, prov: 39742, next: 47185,  inst: [["2017-01-18", 26911], ["2017-04-20", 11797]] },
  { yoa: "2016/17", tax: 35055, prov: 47185, next: 45735,  inst: [["2018-01-22", 22171], ["2018-04-24", 11434]] },
  { yoa: "2017/18", tax: 29152, prov: 45735, next: 52612,  inst: [["2019-01-21", 22876], ["2019-04-23", 13153]] },
  { yoa: "2018/19", tax: 43479, prov: 52612, next: 63479,  inst: [["2020-02-13", 38476], ["2020-05-08", 15870]] },
  { yoa: "2019/20", tax: 46524, prov: 63479, next: 58024,  inst: [["2021-01-20", 26563], ["2021-04-22", 14506]] },
  { yoa: "2020/21", tax: 79831, prov: 58024, next: 89831,  inst: [["2022-01-17", 89180], ["2022-04-20", 22458]] },
  { yoa: "2021/22", tax: 82947, prov: 89831, next: 92947,  inst: [["2023-01-13", 62826], ["2023-04-18", 23237]] },
  { yoa: "2022/23", tax: 97871, prov: 92947, next: 103871, inst: [["2024-01-12", 82827], ["2024-04-15", 25968]] },
];

async function main() {
  // Check the transcription before touching the database.
  for (const y of YEARS) {
    const total = y.inst.reduce((s, [, a]) => s + a, 0);
    if (y.tax - y.prov + y.next !== total) throw new Error(`${y.yoa}: instalments ${total} ≠ tax − provisional + next ${y.tax - y.prov + y.next}`);
  }

  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;

  const found = await prisma.item.findMany({
    where: { userId, categoryGroup: "Tax", category: "Salaries Tax" },
    include: { terms: { select: { startDate: true } } },
  });
  if (found.length !== 1) throw new Error(`Expected exactly 1 Salaries Tax bill, found ${found.length}.`);
  const item = found[0];
  const have = new Set(item.terms.map((t) => t.startDate.toISOString().slice(0, 10)));

  if (dry) console.log("DRY RUN: nothing is saved.\n");
  let added = 0;
  for (const y of YEARS) {
    const startYear = Number(y.yoa.slice(0, 4));
    const start = `${startYear}-04-01`;
    const end = `${startYear + 1}-03-31`;
    const total = y.inst.reduce((s, [, a]) => s + a, 0);

    if (have.has(start)) {
      console.log(`  SKIP  ${y.yoa}: already in the app`);
      continue;
    }

    if (!dry) {
      await prisma.$transaction(async (tx) => {
        const term = await tx.term.create({
          data: {
            itemId: item.id,
            startDate: day(start),
            endDate: day(end),
            dueDate: day(y.inst[0][0]),
            dueRule: "INSTALMENTS",
            amount: dec(total),
            currency: "HKD",
            cycleUnit: "YEAR",
            cycleCount: 1,
            notes: `Year of assessment ${y.yoa}`,
            instalments: { create: y.inst.map(([d, a]) => ({ dueDate: day(d), amountHkd: dec(a) })) },
          },
        });
        await tx.payment.createMany({
          data: y.inst.map(([d, a]) => ({ termId: term.id, paidAt: day(d), amountHkd: dec(a), paymentMethodId: null })),
        });
      });
    }
    added++;
    console.log(`  ADD   ${y.yoa}: HK$${hk(total)} · ${y.inst.map(([d, a]) => `${d} HK$${hk(a)}`).join(" + ")} · paid`);
  }
  console.log(`\n${dry ? "Would add" : "Added"} ${added} year${added === 1 ? "" : "s"} to "${item.name}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
