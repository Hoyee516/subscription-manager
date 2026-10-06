// Copies the mortgage figures out of each payment's note into the new payment fields
// (principalHkd, interestHkd, ratePct, balanceHkd), for bills with category "Mortgage".
// Note format: "Principal 19,851.48 · Interest 12,793.02 · Rate 2.5% · Balance after 6,120,802.17"
// Notes are left as they are. Payments that already have the fields filled are skipped.
//
// Preview first (writes nothing):  npx tsx prisma/fixes/2026-10-06-mortgage-fields.ts
// Then save:                       npx tsx prisma/fixes/2026-10-06-mortgage-fields.ts --save
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const SAVE = process.argv.includes("--save");
const dec = (s: string) => new Prisma.Decimal(s.replace(/,/g, ""));

async function main() {
  const payments = await prisma.payment.findMany({
    where: { term: { item: { category: { equals: "mortgage", mode: "insensitive" } } }, principalHkd: null },
    orderBy: { paidAt: "asc" },
    select: { id: true, paidAt: true, note: true, term: { select: { item: { select: { name: true } } } } },
  });

  let filled = 0;
  for (const p of payments) {
    const n = p.note ?? "";
    const principal = n.match(/Principal ([\d,.]+)/)?.[1];
    const interest = n.match(/Interest ([\d,.]+)/)?.[1];
    const rate = n.match(/Rate ([\d.]+)%/)?.[1];
    const balance = n.match(/Balance after ([\d,.]+)/)?.[1];
    const day = p.paidAt.toISOString().slice(0, 10);
    if (!principal || !interest) {
      console.log(`  skip ${p.term.item.name} ${day}: no principal / interest in note`);
      continue;
    }
    console.log(`  ${p.term.item.name} ${day}: principal ${principal} · interest ${interest} · rate ${rate ?? "—"} · balance ${balance ?? "—"}`);
    if (SAVE) {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          principalHkd: dec(principal),
          interestHkd: dec(interest),
          ratePct: rate ? dec(rate) : null,
          balanceHkd: balance ? dec(balance) : null,
        },
      });
    }
    filled++;
  }
  console.log(`${SAVE ? "Filled" : "Would fill"} ${filled} of ${payments.length} payments.${SAVE ? "" : " Run again with --save to write."}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
