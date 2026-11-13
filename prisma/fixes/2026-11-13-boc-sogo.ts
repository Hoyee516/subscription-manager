// Utility bills paid with the BOC Sogo card were logged with "BOC Sogo" typed into Note, because the
// card wasn't a payment method yet. This adds "BOC Sogo" as a payment method (Card, issuer BOC) and
// sets it as Paid with on every utility bill whose Note mentions "sogo".
//
//  · A Note that is only the card name ("BOC Sogo" / "Sogo") is cleared; any other Note is kept and
//    listed as REVIEW so you can tidy it by hand.
//  · A bill that already has a different Paid with is left alone and listed as CONFLICT.
//
// Run after reviewing:
//   npx tsx --env-file=.env prisma/fixes/2026-11-13-boc-sogo.ts --dry   (shows what it would change)
//   npx tsx --env-file=.env prisma/fixes/2026-11-13-boc-sogo.ts         (changes it)
// Safe to re-run: bills already paid with BOC Sogo are skipped.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dry = process.argv.includes("--dry");
const LABEL = "BOC Sogo";
const isJustCard = (note: string) => ["boc sogo", "sogo"].includes(note.trim().toLowerCase());

async function main() {
  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;
  if (dry) console.log("DRY RUN: nothing is saved.\n");

  let card = await prisma.paymentMethod.findUnique({ where: { userId_label: { userId, label: LABEL } } });
  if (card) console.log(`Payment method "${LABEL}" already exists (${card.type}${card.isActive ? "" : ", ARCHIVED"}).\n`);
  else {
    console.log(`${dry ? "Would create" : "Created"} payment method "${LABEL}" (Card, BOC).\n`);
    if (!dry) card = await prisma.paymentMethod.create({ data: { userId, label: LABEL, type: "CARD", issuer: "BOC" } });
  }

  const bills = await prisma.utilityBill.findMany({
    where: { utility: { userId }, note: { contains: "sogo", mode: "insensitive" } },
    include: { utility: { select: { name: true } }, paymentMethod: { select: { label: true } } },
    orderBy: [{ utility: { name: "asc" } }, { periodStart: "asc" }],
  });

  const n = { set: 0, skip: 0, conflict: 0, review: 0 };
  for (const b of bills) {
    const tag = `${b.utility.name} ${b.periodStart.toISOString().slice(0, 7)} HK$${b.amount} · note ${JSON.stringify(b.note)}`;
    if (card && b.paymentMethodId === card.id) {
      console.log(`  SKIP      ${tag} · already ${LABEL}`);
      n.skip++;
      continue;
    }
    if (b.paymentMethodId) {
      console.log(`  CONFLICT  ${tag} · Paid with is "${b.paymentMethod?.label}", left alone`);
      n.conflict++;
      continue;
    }
    const clear = isJustCard(b.note!);
    console.log(`  ${clear ? "SET      " : "REVIEW   "} ${tag} → Paid with ${LABEL}${clear ? ", note cleared" : ", note kept"}`);
    if (!clear) n.review++;
    n.set++;
    if (!dry) await prisma.utilityBill.update({ where: { id: b.id }, data: { paymentMethodId: card!.id, ...(clear ? { note: null } : {}) } });
  }

  console.log(
    `\n${dry ? "Would set" : "Set"} Paid with = ${LABEL} on ${n.set} utility bill(s)` +
      ` (${n.review} with a note to review); ${n.skip} already done; ${n.conflict} conflict(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
