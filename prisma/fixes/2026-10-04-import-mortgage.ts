// One-off import: BEA mortgage as the bill "Mortgage" (from BEA Mortgage Summary.numbers).
// Run once:  npx tsx prisma/fixes/2026-10-04-import-mortgage.ts
// Refuses to run if a bill named "Mortgage" already exists, so it can't duplicate.
//
// - 25-year loan, HK$7,259,738.88, 2 Aug 2021 – 2 Aug 2046; instalment on the 2nd of each month.
// - Sep 2021 instalment isn't in the source file, so payments start Oct 2021.
// - Sep 2022 and Nov 2023 rows were corrected (interest had been copied from Aug 2022);
//   principal comes from the outstanding-balance column, rate/instalment from the neighbouring months.
// - A new term starts whenever the instalment changes (price history).
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// [paid on, instalment, principal, interest, rate %, balance after]
const ROWS: [string, number, number, number, number, number][] = [
  ["2021-10-02", 28573.40, 20366.99, 8206.41, 1.3641, 7198767.46],
  ["2021-11-02", 28585.90, 20380.15, 8205.75, 1.3679, 7178387.31],
  ["2021-12-02", 28965.20, 20105.46, 8859.74, 1.4811, 7158281.85],
  ["2022-01-02", 28858.70, 20213.35, 8645.35, 1.4493, 7138068.50],
  ["2022-02-02", 29017.40, 20113.91, 8903.49, 1.4968, 7117954.59],
  ["2022-03-02", 29128.10, 20053.07, 9075.03, 1.5299, 7097901.52],
  ["2022-04-02", 29048.00, 20140.79, 8907.21, 1.5059, 7077760.73],
  ["2022-05-02", 29025.10, 20183.86, 8841.24, 1.499, 7057576.87],
  ["2022-06-02", 29159.20, 20104.80, 9054.40, 1.5395, 7037472.07],
  ["2022-07-02", 31213.00, 18613.64, 12599.36, 2.1484, 7018858.43],
  ["2022-08-02", 32433.80, 17811.18, 14622.62, 2.5, 7001047.25],
  ["2022-09-02", 32433.80, 17848.29, 14585.51, 2.5, 6983198.96],
  ["2022-10-02", 32871.80, 17596.06, 15275.74, 2.625, 6965602.90],
  ["2022-11-02", 32871.80, 17634.55, 15237.25, 2.625, 6947968.35],
  ["2022-12-02", 33752.70, 17106.53, 16646.17, 2.875, 6930861.82],
  ["2023-01-02", 34644.30, 16595.19, 18049.11, 3.125, 6914266.63],
  ["2023-02-02", 34644.30, 16638.40, 18005.90, 3.125, 6897628.23],
  ["2023-03-02", 34644.30, 16681.73, 17962.57, 3.125, 6880946.50],
  ["2023-04-02", 34644.30, 16725.17, 17919.13, 3.125, 6864221.33],
  ["2023-05-02", 34644.30, 16768.73, 17875.57, 3.125, 6847452.60],
  ["2023-06-02", 35088.30, 16543.12, 18545.18, 3.25, 6830909.48],
  ["2023-07-02", 35088.30, 16587.93, 18500.37, 3.25, 6814321.55],
  ["2023-08-02", 35532.80, 16367.53, 19165.27, 3.375, 6797954.02],
  ["2023-09-02", 35532.80, 16413.56, 19119.24, 3.375, 6781540.46],
  ["2023-10-02", 35532.80, 16459.72, 19073.08, 3.375, 6765080.74],
  ["2023-11-02", 35532.80, 16506.02, 19026.78, 3.375, 6748574.72],
  ["2023-12-02", 35532.80, 16552.44, 18980.36, 3.375, 6732022.28],
  ["2024-01-02", 35532.80, 16598.99, 18933.81, 3.375, 6715423.29],
  ["2024-02-02", 35532.80, 16645.68, 18887.12, 3.375, 6698777.61],
  ["2024-03-02", 35532.80, 16692.49, 18840.31, 3.375, 6682085.12],
  ["2024-04-02", 35532.70, 16739.44, 18793.26, 3.375, 6665345.68],
  ["2024-05-02", 35532.70, 16786.42, 18746.28, 3.375, 6648559.26],
  ["2024-06-02", 35532.70, 16833.63, 18699.07, 3.375, 6631725.63],
  ["2024-07-02", 35532.70, 16880.98, 18651.72, 3.375, 6614844.65],
  ["2024-08-02", 35532.70, 16928.45, 18604.25, 3.375, 6597916.20],
  ["2024-09-02", 35532.70, 16976.07, 18556.63, 3.375, 6580940.13],
  ["2024-10-02", 34685.50, 17547.64, 17137.86, 3.125, 6563392.49],
  ["2024-11-02", 34731.20, 17593.34, 17137.86, 3.125, 6545799.15],
  ["2024-12-02", 33855.60, 18172.96, 15682.64, 2.875, 6527626.19],
  ["2025-01-02", 33446.40, 18487.26, 14959.14, 2.75, 6509138.93],
  ["2025-02-02", 33446.40, 18529.63, 14916.77, 2.75, 6490609.30],
  ["2025-03-02", 33446.40, 18572.09, 14874.31, 2.75, 6472037.21],
  ["2025-04-02", 33446.40, 18614.65, 14831.75, 2.75, 6453422.56],
  ["2025-05-02", 33446.40, 18657.31, 14789.09, 2.75, 6434765.25],
  ["2025-06-02", 31676.90, 19939.20, 11737.70, 2.1889, 6414826.05],
  ["2025-07-02", 31186.70, 20337.20, 10849.50, 2.0296, 6394488.85],
  ["2025-08-02", 31825.30, 19901.61, 11923.69, 2.2376, 6374587.24],
  ["2025-09-02", 33425.70, 18817.28, 14608.42, 2.75, 6355769.96],
  ["2025-10-02", 33032.30, 19129.06, 13903.24, 2.625, 6336640.90],
  ["2025-11-02", 33032.30, 19170.90, 13861.40, 2.625, 6317470.00],
  ["2025-12-02", 32644.50, 19483.11, 13161.39, 2.5, 6297986.89],
  ["2026-01-02", 32644.50, 19523.70, 13120.80, 2.5, 6278463.19],
  ["2026-02-02", 32644.50, 19564.37, 13080.13, 2.5, 6258898.82],
  ["2026-03-02", 32644.50, 19605.13, 13039.37, 2.5, 6239293.69],
  ["2026-04-02", 32644.50, 19645.98, 12998.52, 2.5, 6219647.71],
  ["2026-05-02", 32644.50, 19686.91, 12957.59, 2.5, 6199960.80],
  ["2026-06-02", 32644.50, 19727.92, 12916.58, 2.5, 6180232.88],
  ["2026-07-02", 32644.50, 19769.02, 12875.48, 2.5, 6160463.86],
  ["2026-08-02", 32644.50, 19810.21, 12834.29, 2.5, 6140653.65],
  ["2026-09-02", 32644.50, 19851.48, 12793.02, 2.5, 6120802.17],
];

async function main() {
  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;

  if (await prisma.item.findFirst({ where: { userId, name: "Mortgage" } })) {
    console.log('A bill named "Mortgage" already exists — import skipped.');
    return;
  }
  const fps = await prisma.paymentMethod.findUnique({ where: { userId_label: { userId, label: "FPS" } } });
  if (!fps) throw new Error('Payment method "FPS" not found — add it under Cards first.');

  // Consecutive months with the same instalment form one term.
  const runs: (typeof ROWS)[] = [];
  for (const r of ROWS) {
    const last = runs[runs.length - 1];
    if (last && last[0][1] === r[1]) last.push(r);
    else runs.push([r]);
  }

  const item = await prisma.item.create({
    data: {
      userId,
      name: "Mortgage",
      vendor: "BEA",
      categoryGroup: "Home",
      category: "Mortgage",
      type: "RECURRING",
      autoRenew: false,
      paymentMethodId: fps.id,
      notes:
        "Original loan HK$7,259,738.88. 25-year term: 2 Aug 2021 – 2 Aug 2046 (300 instalments, on the 2nd of each month). " +
        "Sep 2021 instalment not recorded.",
    },
  });

  let payments = 0;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const start = day(run[0][0]);
    const end = i + 1 < runs.length ? addDays(day(runs[i + 1][0][0]), -1) : day("2046-08-02");
    const rates = [...new Set(run.map((r) => r[4]))];
    const term = await prisma.term.create({
      data: {
        itemId: item.id,
        startDate: start,
        endDate: end,
        amount: new Prisma.Decimal(run[0][1].toFixed(2)),
        currency: "HKD",
        cycleUnit: "MONTH",
        cycleCount: 1,
        notes: `Rate ${rates.map((r) => `${r}%`).join(", ")}`,
      },
    });
    for (const [paid, inst, principal, interest, rate, balance] of run) {
      await prisma.payment.create({
        data: {
          termId: term.id,
          paidAt: day(paid),
          amountHkd: new Prisma.Decimal(inst.toFixed(2)),
          paymentMethodId: fps.id,
          note: `Principal ${fmt(principal)} · Interest ${fmt(interest)} · Rate ${rate}% · Balance after ${fmt(balance)}`,
        },
      });
      payments++;
    }
  }
  console.log(`Created "Mortgage" with ${runs.length} terms and ${payments} payments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
