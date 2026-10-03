// Fills the new Item."Charged to" card from each item's latest term that has a card.
// Run once after `npx prisma db push`:
//   npx tsx --env-file=.env prisma/fixes/2026-10-03-item-card.ts
// Safe to re-run: only items with no card yet are filled.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.item.findMany({
    where: { paymentMethodId: null },
    include: {
      terms: {
        where: { paymentMethodId: { not: null } },
        orderBy: { startDate: "desc" },
        take: 1,
        include: { paymentMethod: { select: { label: true } } },
      },
    },
  });

  let filled = 0;
  for (const it of items) {
    const t = it.terms[0];
    if (!t?.paymentMethodId) continue;
    await prisma.item.update({ where: { id: it.id }, data: { paymentMethodId: t.paymentMethodId } });
    console.log(`  ${it.name} → ${t.paymentMethod?.label}`);
    filled++;
  }
  const missing = await prisma.item.findMany({ where: { paymentMethodId: null }, select: { name: true } });
  console.log(`Done. ${filled} item(s) filled. Still without a card: ${missing.map((m) => m.name).join(", ") || "none"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
