// Converts the old free-text "Combined bill" (Payment.batchRef) into linked
// payment batches with a combined total, e.g.
//   "Prudential Apr 2026 bill, total HK$19,745.03" → one PaymentBatch, totalHkd 19745.03
// Run once, after `npx prisma db push`:  npx tsx prisma/fixes/2026-10-04-payment-batches.ts
// Safe to re-run: payments already linked to a batch are skipped.
// HISTORICAL: already run on 4 Oct 2026; Payment.batchRef has since been dropped, so this no longer compiles against the current schema.
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const payments = await prisma.payment.findMany({
    where: { batchRef: { not: null }, batchId: null },
    select: { id: true, batchRef: true, term: { select: { item: { select: { userId: true, name: true } } } } },
  });
  if (payments.length === 0) {
    console.log("Nothing to convert.");
    return;
  }

  // Same text + same user = same combined bill.
  const groups = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = `${p.term.item.userId}|${p.batchRef!.trim()}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  for (const [key, list] of groups) {
    const ref = key.split("|").slice(1).join("|");
    const m = ref.match(/total\s*HK\$\s*([\d,]+(?:\.\d{1,2})?)/i);
    const totalHkd = m ? new Prisma.Decimal(m[1].replace(/,/g, "")) : null;
    if (list.length < 2) {
      console.log(`SKIP "${ref}": only 1 payment (${list[0].term.item.name}), nothing to link.`);
      continue;
    }
    const batch = await prisma.paymentBatch.create({ data: { totalHkd } });
    await prisma.payment.updateMany({ where: { id: { in: list.map((p) => p.id) } }, data: { batchId: batch.id } });
    console.log(`OK   "${ref}" → ${list.length} payments (${list.map((p) => p.term.item.name).join(", ")}), total ${totalHkd ?? "not found"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
