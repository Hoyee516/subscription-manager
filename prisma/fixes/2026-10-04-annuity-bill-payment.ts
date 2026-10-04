// Sets How = Bill Payment on 年金 payments paid in 2025 and 2026.
// Run once, AFTER `npx prisma db push` (which adds BILL_PAYMENT):
//   npx tsx prisma/fixes/2026-10-04-annuity-bill-payment.ts
// Safe to re-run. Lists every payment it touches.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const day = (s: string) => new Date(`${s}T00:00:00Z`);

async function main() {
  const where = {
    term: { item: { name: "年金" } },
    paidAt: { gte: day("2025-01-01"), lt: day("2027-01-01") },
  };
  const list = await prisma.payment.findMany({
    where,
    orderBy: { paidAt: "asc" },
    select: { paidAt: true, amountHkd: true, channel: true },
  });
  if (list.length === 0) {
    console.log("No 年金 payments found in 2025–2026. Check the bill name.");
    return;
  }
  for (const p of list) console.log(`  ${p.paidAt.toISOString().slice(0, 10)}  HK$${p.amountHkd}  ${p.channel ?? "—"} → BILL_PAYMENT`);
  const r = await prisma.payment.updateMany({ where, data: { channel: "BILL_PAYMENT" } });
  console.log(`Updated ${r.count} payment(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
