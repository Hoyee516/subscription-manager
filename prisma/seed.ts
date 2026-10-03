// Loads prisma/seed-data.json into an EMPTY database for SEED_USERNAME.
// Run: npx prisma db seed
// Refuses to run if that user already has items, so it can't duplicate data.
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

type SeedPayment = {
  paidAt: string;
  amountHkd: number;
  paymentMethod?: string;
  channel?: Prisma.PaymentCreateInput["channel"];
  batchRef?: string;
  note?: string;
};
type SeedTerm = {
  startDate: string;
  endDate: string | null;
  dueDate: string | null;
  amount: number;
  currency: string;
  amountHkd?: number;
  cycleUnit: Prisma.TermCreateInput["cycleUnit"];
  cycleCount: number;
  commitmentMonths?: number;
  paymentMethod: string | null;
  notes?: string;
  payments: SeedPayment[];
};
type SeedReminder = { offset: number; unit: Prisma.ReminderCreateInput["unit"] };
type SeedItem = {
  key: string;
  parentKey?: string;
  name: string;
  vendor: string;
  categoryGroup: string;
  category: string;
  type: Prisma.ItemCreateInput["type"];
  status: Prisma.ItemCreateInput["status"];
  isSavings: boolean;
  autoRenew: boolean;
  notes?: string;
  reminders: SeedReminder[];
  terms: SeedTerm[];
};
type SeedUtility = {
  name: string;
  cycleMonths: number;
  reminders: SeedReminder[];
  bills: { periodStart: string; amount: number; credit?: number }[];
};
type SeedData = {
  paymentMethods: { label: string; type: Prisma.PaymentMethodCreateInput["type"]; issuer: string | null }[];
  items: SeedItem[];
  utilities: SeedUtility[];
};

const day = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);

async function main() {
  const username = process.env.SEED_USERNAME;
  const password = process.env.SEED_PASSWORD;
  if (!username || !password) throw new Error("Set SEED_USERNAME and SEED_PASSWORD in .env");

  const data: SeedData = JSON.parse(readFileSync(join(__dirname, "seed-data.json"), "utf8"));

  const user = await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash: await bcrypt.hash(password, 12) },
  });

  const existing = await prisma.item.count({ where: { userId: user.id } });
  if (existing > 0) {
    console.log(`User "${username}" already has ${existing} items — seed skipped.`);
    return;
  }

  const pm = new Map<string, string>();
  for (const m of data.paymentMethods) {
    const row = await prisma.paymentMethod.create({
      data: { userId: user.id, label: m.label, type: m.type, issuer: m.issuer },
    });
    pm.set(m.label, row.id);
  }
  const pmId = (label?: string | null) => {
    if (!label) return null;
    const id = pm.get(label);
    if (!id) throw new Error(`Unknown payment method "${label}"`);
    return id;
  };

  // Parents first so riders can point at them.
  const ordered = [...data.items].sort((a, b) => Number(!!a.parentKey) - Number(!!b.parentKey));
  const itemIds = new Map<string, string>();

  for (const it of ordered) {
    const lastCard = [...it.terms].reverse().find((t) => t.paymentMethod)?.paymentMethod ?? null;
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        name: it.name,
        vendor: it.vendor,
        categoryGroup: it.categoryGroup,
        category: it.category,
        type: it.type,
        status: it.status,
        isSavings: it.isSavings,
        autoRenew: it.autoRenew,
        notes: it.notes ?? null,
        parentId: it.parentKey ? itemIds.get(it.parentKey) ?? null : null,
        paymentMethodId: pmId(lastCard),
        reminders: { create: it.reminders.map((r) => ({ offset: r.offset, unit: r.unit })) },
      },
    });
    itemIds.set(it.key, item.id);

    for (const t of it.terms) {
      await prisma.term.create({
        data: {
          itemId: item.id,
          startDate: day(t.startDate)!,
          endDate: day(t.endDate),
          dueDate: day(t.dueDate),
          amount: t.amount,
          currency: t.currency,
          amountHkd: t.amountHkd ?? null,
          cycleUnit: t.cycleUnit,
          cycleCount: t.cycleCount,
          commitmentMonths: t.commitmentMonths ?? null,
          paymentMethodId: pmId(t.paymentMethod),
          notes: t.notes ?? null,
          payments: {
            create: t.payments.map((p) => ({
              paidAt: day(p.paidAt)!,
              amountHkd: p.amountHkd,
              paymentMethodId: pmId(p.paymentMethod),
              channel: p.channel ?? null,
              batchRef: p.batchRef ?? null,
              note: p.note ?? null,
            })),
          },
        },
      });
    }
  }

  for (const u of data.utilities) {
    await prisma.utility.create({
      data: {
        userId: user.id,
        name: u.name,
        cycleMonths: u.cycleMonths,
        reminders: { create: u.reminders.map((r) => ({ offset: r.offset, unit: r.unit })) },
        bills: {
          create: u.bills.map((b) => ({
            periodStart: day(b.periodStart)!,
            amount: b.amount,
            credit: b.credit ?? null,
          })),
        },
      },
    });
  }

  const counts = {
    paymentMethods: await prisma.paymentMethod.count({ where: { userId: user.id } }),
    items: await prisma.item.count({ where: { userId: user.id } }),
    terms: await prisma.term.count({ where: { item: { userId: user.id } } }),
    payments: await prisma.payment.count({ where: { term: { item: { userId: user.id } } } }),
    utilityBills: await prisma.utilityBill.count({ where: { utility: { userId: user.id } } }),
  };
  console.log(`Seeded "${username}":`, counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
