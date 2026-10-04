// "FPS" moves from How (channel) to Paid with (payment method) only.
// Clears channel = FPS on existing payments; any of them without a Paid with
// gets the user's "FPS" payment method. Uses raw SQL so it works before and
// after the enum value is removed from the schema.
// Run once, BEFORE `npx prisma db push`:  npx tsx prisma/fixes/2026-10-04-drop-fps-channel.ts
// Safe to re-run.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const withMethod = await prisma.$executeRawUnsafe(`
    UPDATE "Payment" p SET "paymentMethodId" = m.id
    FROM "Term" t, "Item" i, "PaymentMethod" m
    WHERE p."termId" = t.id AND t."itemId" = i.id
      AND m."userId" = i."userId" AND m.label = 'FPS'
      AND p.channel::text = 'FPS' AND p."paymentMethodId" IS NULL`);
  const cleared = await prisma.$executeRawUnsafe(`UPDATE "Payment" SET channel = NULL WHERE channel::text = 'FPS'`);
  console.log(`Set Paid with = FPS on ${withMethod} payment(s); cleared How = FPS on ${cleared} payment(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
