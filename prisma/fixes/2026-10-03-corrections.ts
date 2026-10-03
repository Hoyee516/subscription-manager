// One-off data corrections agreed on 3 Oct 2026 (README "Seed data to review").
// Run once:  npx tsx prisma/fixes/2026-10-03-corrections.ts
// Safe to re-run: each step checks the current value and skips if already fixed.
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const log = (msg: string) => console.log(msg);

async function main() {
  const users = await prisma.user.findMany();
  if (users.length !== 1) throw new Error(`Expected exactly 1 user, found ${users.length}`);
  const userId = users[0].id;

  const item = async (name: string) => {
    const it = await prisma.item.findFirst({ where: { userId, name } });
    if (!it) throw new Error(`Item "${name}" not found`);
    return it;
  };
  const method = async (label: string) => {
    const m = await prisma.paymentMethod.findUnique({ where: { userId_label: { userId, label } } });
    if (!m) throw new Error(`Payment method "${label}" not found`);
    return m;
  };

  // #1 醫療: currency is USD
  {
    const it = await item("醫療");
    const r = await prisma.term.updateMany({
      where: { itemId: it.id, currency: "HKD" },
      data: { currency: "USD", notes: "158.39 + 511.01 / year" },
    });
    log(`#1  醫療 term currency → USD: ${r.count ? "changed" : "already done"}`);
  }

  // #2 大病醫療: ended 31 Jul 2020
  {
    const it = await item("大病醫療");
    const r = await prisma.term.updateMany({
      where: { itemId: it.id, endDate: null },
      data: { endDate: day("2020-07-31"), notes: null },
    });
    await prisma.item.update({
      where: { id: it.id },
      data: { notes: "危疾 rider. 保額 HK$1 Mil / disease; HK$6 Mil lifelong. Ended 31 Jul 2020." },
    });
    log(`#2  大病醫療 end date 31 Jul 2020: ${r.count ? "changed" : "already done"}`);
  }

  // #3 家務助理保險: first term is 11 Mar 2025 – 10 Mar 2026, paid 11 Mar 2025
  {
    const it = await item("家務助理保險");
    const t = await prisma.term.findFirst({ where: { itemId: it.id, startDate: day("2024-03-11") } });
    if (t) {
      await prisma.term.update({
        where: { id: t.id },
        data: { startDate: day("2025-03-11"), dueDate: day("2025-03-11"), endDate: day("2026-03-10") },
      });
      await prisma.payment.updateMany({
        where: { termId: t.id, paidAt: day("2024-03-11") },
        data: { paidAt: day("2025-03-11"), note: "Enrolled & paid" },
      });
      log("#3  家務助理保險 first term → 11 Mar 2025 – 10 Mar 2026: changed");
    } else log("#3  家務助理保險 first term: already done");
  }

  // #5 年金 2026: last instalment HK$10,075.75 on 13 Aug 2026
  {
    const it = await item("年金");
    const r = await prisma.payment.updateMany({
      where: { term: { itemId: it.id }, paidAt: day("2026-08-13"), amountHkd: new Prisma.Decimal(10000) },
      data: { amountHkd: new Prisma.Decimal("10075.75") },
    });
    log(`#5  年金 13 Aug 2026 payment → HK$10,075.75: ${r.count ? "changed" : "already done"}`);
  }

  // #6 DBS → DBS Credit Card; add DBS Debit Card
  {
    const old = await prisma.paymentMethod.findUnique({ where: { userId_label: { userId, label: "DBS" } } });
    if (old) {
      await prisma.paymentMethod.update({ where: { id: old.id }, data: { label: "DBS Credit Card", type: "CARD" } });
      log("#6  DBS → DBS Credit Card: changed");
    } else log("#6  DBS → DBS Credit Card: already done");
    const debit = await prisma.paymentMethod.upsert({
      where: { userId_label: { userId, label: "DBS Debit Card" } },
      update: {},
      create: { userId, label: "DBS Debit Card", type: "CARD", issuer: "DBS" },
    });
    log(`#6  DBS Debit Card present (${debit.id.slice(0, 8)})`);
  }

  // #8 Payment methods for HKBN (all contracts), Claude Pro, SurfShark
  {
    const sc = await method("SC Simply Cash");
    const dbsDebit = await method("DBS Debit Card");
    const aeon = await method("Aeon WAKUWAKU");
    const hkbn = await item("Mobile");
    const claude = await item("Claude Pro");
    const surf = await prisma.item.findMany({ where: { userId, vendor: "SurfShark" } });
    const a = await prisma.term.updateMany({ where: { itemId: hkbn.id, paymentMethodId: null }, data: { paymentMethodId: sc.id } });
    const b = await prisma.term.updateMany({ where: { itemId: claude.id, paymentMethodId: null }, data: { paymentMethodId: dbsDebit.id } });
    const c = await prisma.term.updateMany({
      where: { itemId: { in: surf.map((s) => s.id) }, paymentMethodId: null },
      data: { paymentMethodId: aeon.id },
    });
    log(`#8  HKBN → SC Simply Cash: ${a.count} term(s); Claude Pro → DBS Debit Card: ${b.count}; SurfShark → Aeon WAKUWAKU: ${c.count}`);
  }

  // #11 Navigator first contract ended 16 Apr 2026 (renewed early)
  {
    const it = await item("Home broadband");
    const r = await prisma.term.updateMany({
      where: { itemId: it.id, startDate: day("2023-09-09"), endDate: day("2026-09-08") },
      data: { endDate: day("2026-04-16") },
    });
    log(`#11 Navigator 2023 contract end → 16 Apr 2026: ${r.count ? "changed" : "already done"}`);
  }

  // #12 Electricity Nov 2022 = HK$0
  {
    const u = await prisma.utility.findUnique({ where: { userId_name: { userId, name: "Electricity" } } });
    if (!u) throw new Error("Utility Electricity not found");
    const exists = await prisma.utilityBill.findUnique({
      where: { utilityId_periodStart: { utilityId: u.id, periodStart: day("2022-11-01") } },
    });
    if (!exists) {
      await prisma.utilityBill.create({ data: { utilityId: u.id, periodStart: day("2022-11-01"), amount: 0 } });
      log("#12 Electricity Nov 2022 HK$0: added");
    } else log("#12 Electricity Nov 2022: already done");
  }

  const counts = {
    paymentMethods: await prisma.paymentMethod.count({ where: { userId } }),
    utilityBills: await prisma.utilityBill.count({ where: { utility: { userId } } }),
  };
  log(`Done. Now: ${counts.paymentMethods} payment methods, ${counts.utilityBills} utility bills (expected 7 and 95).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
