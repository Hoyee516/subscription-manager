// Switches on "Charged automatically" for bills paid by their card each cycle.
// Run once, AFTER `npx prisma db push` (which adds Item.autoCharge):
//   npx tsx prisma/fixes/2026-10-04-auto-charge.ts
// Safe to re-run. Prints each bill it finds and any name it can't find.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NAMES = [
  "Home broadband",
  "Mobile",
  "Claude Pro",
  "Norton Antivirus",
  "Google One 100GB",
  "Patreon · Ahju",
  "Substack · Unclestock",
  "Mortgage",
];

async function main() {
  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;

  for (const name of NAMES) {
    const items = await prisma.item.findMany({ where: { userId, name }, select: { id: true, autoCharge: true } });
    if (items.length === 0) {
      console.log(`NOT FOUND  ${name} — switch it on in the app (Edit bill) if it's under another name`);
      continue;
    }
    await prisma.item.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { autoCharge: true } });
    console.log(`${items.every((i) => i.autoCharge) ? "ALREADY ON" : "ON        "} ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
