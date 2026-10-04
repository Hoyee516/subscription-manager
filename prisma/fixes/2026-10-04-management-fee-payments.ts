// Logs Management Fee payments: FPS, on the 1st of each month, from the first term's
// start month up to and including October 2026. Each month's amount = the HKD price of
// the term in force that month. Months that already have a payment are skipped.
//
// Preview first (writes nothing):  npx tsx prisma/fixes/2026-10-04-management-fee-payments.ts
// Then save:                       npx tsx prisma/fixes/2026-10-04-management-fee-payments.ts --save
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const SAVE = process.argv.includes("--save");
const LAST = new Date(Date.UTC(2026, 9, 1)); // 1 Oct 2026
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;

  // Match the name loosely (case, spaces, e.g. "Management fee", "管理費 Management Fee").
  const matches = await prisma.item.findMany({
    where: { userId, OR: [{ name: { contains: "management", mode: "insensitive" } }, { name: { contains: "管理" } }] },
    include: { terms: { orderBy: { startDate: "asc" }, include: { payments: { select: { paidAt: true } } } } },
  });
  if (matches.length !== 1) {
    const all = await prisma.item.findMany({ where: { userId }, select: { name: true, categoryGroup: true }, orderBy: { name: "asc" } });
    console.log(matches.length ? `Several bills match: ${matches.map((m) => m.name).join(", ")}` : "No bill name contains \"management\".");
    console.log("Your bills:\n" + all.map((a) => `  ${a.name}  (${a.categoryGroup})`).join("\n"));
    throw new Error("Tell Claude which of these is the management fee.");
  }
  const item = matches[0];
  console.log(`Bill: ${item.name}`);
  if (item.terms.length === 0) throw new Error("Management Fee has no term yet — add one with the monthly fee first.");
  const fps = await prisma.paymentMethod.findUnique({ where: { userId_label: { userId, label: "FPS" } } });
  if (!fps) throw new Error('Payment method "FPS" not found.');

  const paidMonths = new Set(item.terms.flatMap((t) => t.payments.map((p) => iso(p.paidAt).slice(0, 7))));
  const first = item.terms[0].startDate;
  let created = 0;
  let skipped = 0;

  for (let d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); d <= LAST; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    // The term in force that month: the latest one that started on or before the month's end.
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const term = [...item.terms].reverse().find((t) => t.startDate <= monthEnd) ?? item.terms[0];
    const hkd = term.amountHkd ?? (term.currency === "HKD" ? term.amount : null);
    if (hkd === null) throw new Error(`Term from ${iso(term.startDate)} is in ${term.currency} with no HKD equivalent — add one first.`);

    if (paidMonths.has(iso(d).slice(0, 7))) {
      console.log(`  ${iso(d)}  already has a payment — skipped`);
      skipped++;
      continue;
    }
    console.log(`  ${iso(d)}  HK$${hkd}  FPS${SAVE ? "" : "  (preview)"}`);
    if (SAVE) {
      await prisma.payment.create({
        data: { termId: term.id, paidAt: d, amountHkd: new Prisma.Decimal(hkd.toString()), paymentMethodId: fps.id },
      });
    }
    created++;
  }
  console.log(`${SAVE ? "Created" : "Would create"} ${created} payment(s); ${skipped} month(s) already had one.`);
  if (!SAVE) console.log("Nothing saved. Re-run with --save to log them.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
