"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { parseDay } from "@/lib/dates";
import { CHANNELS, CYCLE_UNITS, ITEM_TYPES, type LeadUnitName } from "@/lib/billing";

export type ActionResult = { ok: true; id?: string; warning?: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function optStr(fd: FormData, key: string): string | null {
  return str(fd, key) || null;
}
function decimal(fd: FormData, key: string): Prisma.Decimal | null {
  const v = str(fd, key).replace(/,/g, "");
  if (!v || !/^-?\d+(\.\d{1,2})?$/.test(v)) return null;
  return new Prisma.Decimal(v);
}

// ---------- ownership checks (data isolation) ----------

async function ownItem(userId: string, itemId: string) {
  return prisma.item.findFirst({ where: { id: itemId, userId }, select: { id: true } });
}
async function ownTerm(userId: string, termId: string) {
  return prisma.term.findFirst({ where: { id: termId, item: { userId } }, select: { id: true, itemId: true } });
}
async function ownMethod(userId: string, methodId: string | null) {
  if (!methodId) return null;
  const m = await prisma.paymentMethod.findFirst({ where: { id: methodId, userId }, select: { id: true } });
  return m?.id ?? null;
}

// ---------- items ----------

function readItemFields(fd: FormData) {
  const type = str(fd, "type");
  if (!ITEM_TYPES.some((t) => t.value === type)) return null;
  const name = str(fd, "name");
  const vendor = str(fd, "vendor");
  const categoryGroup = str(fd, "categoryGroup");
  const category = str(fd, "category");
  if (!name || !vendor || !categoryGroup || !category) return null;
  return {
    name,
    vendor,
    categoryGroup,
    category,
    type: type as (typeof ITEM_TYPES)[number]["value"],
    autoRenew: fd.get("autoRenew") === "on",
    isSavings: fd.get("isSavings") === "on",
    notes: optStr(fd, "notes"),
  };
}

function readTermFields(fd: FormData) {
  const startDate = parseDay(fd.get("startDate"));
  const amount = decimal(fd, "amount");
  const cycleUnit = str(fd, "cycleUnit");
  if (!startDate || amount === null || !CYCLE_UNITS.some((c) => c.value === cycleUnit)) return null;
  const endDate = parseDay(fd.get("endDate"));
  if (endDate && endDate < startDate) return null;
  const cycleCount = Math.max(1, parseInt(str(fd, "cycleCount") || "1", 10) || 1);
  return {
    startDate,
    endDate,
    dueDate: parseDay(fd.get("dueDate")),
    amount,
    currency: str(fd, "currency") || "HKD",
    amountHkd: decimal(fd, "amountHkd"),
    cycleUnit: cycleUnit as (typeof CYCLE_UNITS)[number]["value"],
    cycleCount,
    notes: optStr(fd, "termNotes"),
  };
}

export async function createItem(fd: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const item = readItemFields(fd);
  if (!item) return fail("Fill in name, vendor, category and billing type.");
  const term = readTermFields(fd);
  if (!term) return fail("Fill in the first term: start date, amount and cycle (end date can't be before start).");
  const paymentMethodId = await ownMethod(userId, optStr(fd, "paymentMethodId"));

  const created = await prisma.item.create({
    data: { ...item, userId, paymentMethodId, terms: { create: term } },
  });
  revalidatePath("/bills");
  return { ok: true, id: created.id };
}

export async function updateItem(itemId: string, fd: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!(await ownItem(userId, itemId))) return fail("Item not found.");
  const item = readItemFields(fd);
  if (!item) return fail("Fill in name, vendor, category and billing type.");
  const paymentMethodId = await ownMethod(userId, optStr(fd, "paymentMethodId"));
  await prisma.item.update({ where: { id: itemId }, data: { ...item, paymentMethodId } });
  revalidatePath("/bills");
  revalidatePath(`/bills/${itemId}`);
  return { ok: true, id: itemId };
}

export async function setItemStatus(itemId: string, status: "ACTIVE" | "ENDED" | "CANCELLED"): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!(await ownItem(userId, itemId))) return fail("Item not found.");
  await prisma.item.update({ where: { id: itemId }, data: { status } });
  revalidatePath("/bills");
  revalidatePath(`/bills/${itemId}`);
  return { ok: true, id: itemId };
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!(await ownItem(userId, itemId))) return fail("Item not found.");
  await prisma.item.delete({ where: { id: itemId } }); // cascades to riders, terms, payments, reminders
  revalidatePath("/bills");
  return { ok: true };
}

// ---------- terms ----------

export async function saveTerm(itemId: string, termId: string | null, fd: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!(await ownItem(userId, itemId))) return fail("Item not found.");
  const term = readTermFields(fd);
  if (!term) return fail("Check start date, amount and cycle (end date can't be before start).");

  if (termId) {
    const t = await ownTerm(userId, termId);
    if (!t || t.itemId !== itemId) return fail("Term not found.");
    await prisma.term.update({ where: { id: termId }, data: term });
  } else {
    await prisma.term.create({ data: { ...term, itemId } });
  }

  // Riders' terms for the same policy year: dates and cycle come from the main term,
  // amounts are each rider's own. A blank amount leaves that rider alone.
  const riders = await prisma.item.findMany({ where: { userId, parentId: itemId }, select: { id: true } });
  for (const r of riders) {
    const amount = decimal(fd, `riderAmount_${r.id}`);
    if (amount === null) continue;
    const data = {
      startDate: term.startDate,
      endDate: term.endDate,
      dueDate: term.dueDate,
      cycleUnit: term.cycleUnit,
      cycleCount: term.cycleCount,
      amount,
      currency: str(fd, `riderCurrency_${r.id}`) || "HKD",
      amountHkd: decimal(fd, `riderHkd_${r.id}`),
    };
    const existingId = optStr(fd, `riderTerm_${r.id}`);
    const existing = existingId ? await prisma.term.findFirst({ where: { id: existingId, itemId: r.id }, select: { id: true } }) : null;
    if (existing) await prisma.term.update({ where: { id: existing.id }, data });
    else await prisma.term.create({ data: { ...data, itemId: r.id } });
    revalidatePath(`/bills/${r.id}`);
  }

  revalidatePath(`/bills/${itemId}`);
  revalidatePath("/bills");
  return { ok: true, id: itemId };
}

export async function deleteTerm(termId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const t = await ownTerm(userId, termId);
  if (!t) return fail("Term not found.");
  const count = await prisma.term.count({ where: { itemId: t.itemId } });
  if (count <= 1) return fail("An item needs at least one term. Delete the item instead.");

  // Riders' terms for the same policy year go too, unless it's a rider's only term.
  const { startDate } = await prisma.term.findUniqueOrThrow({ where: { id: termId }, select: { startDate: true } });
  const riderTerms = await prisma.term.findMany({
    where: { startDate, item: { userId, parentId: t.itemId } },
    select: { id: true, itemId: true, item: { select: { name: true, _count: { select: { terms: true } } } } },
  });
  const kept = riderTerms.filter((r) => r.item._count.terms <= 1);
  const ids = [termId, ...riderTerms.filter((r) => r.item._count.terms > 1).map((r) => r.id)];

  // Payments go with their terms; a combined bill left with one payment is unlinked.
  const batchIds = (
    await prisma.payment.findMany({ where: { termId: { in: ids }, batchId: { not: null } }, select: { batchId: true } })
  ).map((p) => p.batchId!);
  await prisma.term.deleteMany({ where: { id: { in: ids } } });
  for (const b of new Set(batchIds)) {
    if (await prisma.paymentBatch.findUnique({ where: { id: b }, select: { id: true } })) await cleanupBatch(b);
  }

  for (const r of riderTerms) revalidatePath(`/bills/${r.itemId}`);
  revalidatePath(`/bills/${t.itemId}`);
  revalidatePath("/bills");
  return {
    ok: true,
    id: t.itemId,
    warning: kept.length
      ? `Kept ${kept.map((r) => r.item.name).join(", ")}'s term: it's the rider's only term. Delete the rider instead if it has ended.`
      : undefined,
  };
}

// ---------- payments ----------

export async function savePayment(termId: string, paymentId: string | null, fd: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const t = await ownTerm(userId, termId);
  if (!t) return fail("Term not found.");
  const paidAt = parseDay(fd.get("paidAt"));
  const amountHkd = decimal(fd, "amountHkd");
  if (!paidAt || amountHkd === null) return fail("Fill in the payment date and amount (HKD).");
  const channel = str(fd, "channel");
  const data = {
    paidAt,
    amountHkd,
    paymentMethodId: await ownMethod(userId, optStr(fd, "paymentMethodId")),
    channel: CHANNELS.some((c) => c.value === channel) ? (channel as (typeof CHANNELS)[number]["value"]) : null,
    note: optStr(fd, "note"),
  };

  // Combined bill: only bills of this user with the same group + vendor are accepted.
  const self = await prisma.item.findUniqueOrThrow({ where: { id: t.itemId }, select: { categoryGroup: true, vendor: true } });
  const picked = fd.getAll("combinedWith").filter((v): v is string => typeof v === "string" && v !== "");
  const picks = picked.length
    ? await prisma.item.findMany({
        where: { id: { in: picked, not: t.itemId }, userId, categoryGroup: self.categoryGroup, vendor: self.vendor },
        select: { id: true, name: true },
      })
    : [];
  // A combined partner brings its riders along (riders aren't offered as checkboxes).
  const partners = [
    ...picks,
    ...(picks.length
      ? await prisma.item.findMany({ where: { userId, parentId: { in: picks.map((x) => x.id) } }, select: { id: true, name: true } })
      : []),
  ];
  const combinedTotal = decimal(fd, "combinedTotal");

  // This bill's own riders are edited on the same form: rider_<id> = amount, riderPayment_<id> = existing payment.
  const riders = await prisma.item.findMany({ where: { userId, parentId: t.itemId }, select: { id: true } });
  const riderInput = riders.map((r) => ({
    itemId: r.id,
    amountHkd: decimal(fd, `rider_${r.id}`),
    paymentId: optStr(fd, `riderPayment_${r.id}`),
  }));

  let id = paymentId;
  if (paymentId) {
    const p = await prisma.payment.findFirst({ where: { id: paymentId, termId } });
    if (!p) return fail("Payment not found.");
    await prisma.payment.update({ where: { id: paymentId }, data });
  } else {
    id = (await prisma.payment.create({ data: { ...data, termId } })).id;
  }

  const termStart = (await prisma.term.findUniqueOrThrow({ where: { id: termId }, select: { startDate: true } })).startDate;
  const riderPaymentIds = await saveRiderPayments(riderInput, data, termStart);

  const unpriced = await linkBatch(id!, data, partners, combinedTotal, riderPaymentIds);
  for (const r of riders) revalidatePath(`/bills/${r.id}`);

  revalidatePath(`/bills/${t.itemId}`);
  for (const it of partners) revalidatePath(`/bills/${it.id}`);
  revalidatePath("/bills");
  return {
    ok: true,
    id: t.itemId,
    warning: unpriced.length
      ? `Payment added to ${unpriced.join(", ")} with amount HK$0 — couldn't work out its share. Open it and enter the amount.`
      : undefined,
  };
}

/** The term a linked payment belongs on: same start date as the main payment's term, else the latest. */
async function pickTerm(itemId: string, startDate: Date) {
  const terms = await prisma.term.findMany({
    where: { itemId },
    orderBy: { startDate: "desc" },
    select: { id: true, startDate: true, amount: true, currency: true, amountHkd: true, payments: { select: { amountHkd: true } } },
  });
  return terms.find((x) => x.startDate.getTime() === startDate.getTime()) ?? terms[0] ?? null;
}

/**
 * Saves the riders' payments entered alongside the main bill's payment, with the
 * same date, card, channel and note. A blank amount means no rider payment:
 * an existing one is removed. Returns the rider payment ids that remain.
 */
async function saveRiderPayments(
  input: { itemId: string; amountHkd: Prisma.Decimal | null; paymentId: string | null }[],
  fill: Omit<PaymentFill, "amountHkd">,
  termStart: Date
): Promise<string[]> {
  const ids: string[] = [];
  for (const r of input) {
    const existing = r.paymentId
      ? await prisma.payment.findFirst({ where: { id: r.paymentId, term: { itemId: r.itemId } }, select: { id: true, batchId: true } })
      : null;
    if (r.amountHkd === null) {
      if (existing) {
        await prisma.payment.delete({ where: { id: existing.id } });
        if (existing.batchId) await cleanupBatch(existing.batchId);
      }
      continue;
    }
    const data = { ...fill, amountHkd: r.amountHkd };
    if (existing) {
      await prisma.payment.update({ where: { id: existing.id }, data });
      ids.push(existing.id);
    } else {
      const term = await pickTerm(r.itemId, termStart);
      if (!term) continue;
      ids.push((await prisma.payment.create({ data: { ...data, termId: term.id }, select: { id: true } })).id);
    }
  }
  return ids;
}

type PaymentFill = {
  paidAt: Date;
  amountHkd: Prisma.Decimal;
  paymentMethodId: string | null;
  channel: (typeof CHANNELS)[number]["value"] | null;
  note: string | null;
};

/**
 * Links a payment with the partner bills' payments on the same date (both ways),
 * so opening any of them shows the same combined bill. A partner with no payment
 * on that date gets one created with the same date, card, channel and note, and
 * its own share as the amount. Returns names whose share couldn't be worked out.
 */
async function linkBatch(
  paymentId: string,
  fill: PaymentFill,
  partners: { id: string; name: string }[],
  totalHkd: Prisma.Decimal | null,
  riderPaymentIds: string[] = [] // this bill's own rider payments: follow the main payment
): Promise<string[]> {
  const current = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { batchId: true, term: { select: { startDate: true } } },
  });

  if (partners.length === 0) {
    if (current.batchId) {
      await prisma.payment.updateMany({ where: { id: { in: [paymentId, ...riderPaymentIds] } }, data: { batchId: null } });
      await cleanupBatch(current.batchId);
    }
    return [];
  }

  const found: { id: string; batchId: string | null }[] = [];
  const toCreate: { itemId: string; name: string; termId: string; share: number | null }[] = [];
  for (const it of partners) {
    const p = await prisma.payment.findFirst({
      where: { paidAt: fill.paidAt, term: { itemId: it.id } },
      select: { id: true, batchId: true },
    });
    if (p) {
      found.push(p);
      continue;
    }
    // Same policy year as the payment being saved if there is one, else the latest term.
    const term = await pickTerm(it.id, current.term.startDate);
    if (!term) continue; // a bill always has a term; nothing to attach to otherwise
    const price = term.amountHkd ? Number(term.amountHkd) : term.currency === "HKD" ? Number(term.amount) : null;
    const paid = term.payments.reduce((sum, x) => sum + Number(x.amountHkd), 0);
    toCreate.push({ itemId: it.id, name: it.name, termId: term.id, share: price === null ? null : Math.max(0, price - paid) });
  }

  // If exactly one share is unknown, it's whatever the combined total leaves over.
  const unknown = toCreate.filter((c) => c.share === null);
  if (unknown.length === 1 && totalHkd) {
    const others = await prisma.payment.findMany({
      where: { id: { in: [...found.map((f) => f.id), ...riderPaymentIds] } },
      select: { amountHkd: true },
    });
    const known =
      Number(fill.amountHkd) +
      others.reduce((sum, x) => sum + Number(x.amountHkd), 0) +
      toCreate.reduce((sum, c) => sum + (c.share ?? 0), 0);
    const rest = Number(totalHkd) - known;
    if (rest >= 0) unknown[0].share = rest;
  }

  const unpriced: string[] = [];
  for (const c of toCreate) {
    if (c.share === null) unpriced.push(c.name);
    const created = await prisma.payment.create({
      data: {
        termId: c.termId,
        paidAt: fill.paidAt,
        amountHkd: new Prisma.Decimal((c.share ?? 0).toFixed(2)),
        paymentMethodId: fill.paymentMethodId,
        channel: fill.channel,
        note: fill.note,
      },
      select: { id: true },
    });
    found.push({ id: created.id, batchId: null });
  }

  const batchId =
    current.batchId ??
    found.find((p) => p.batchId)?.batchId ??
    (await prisma.paymentBatch.create({ data: { totalHkd }, select: { id: true } })).id;
  await prisma.paymentBatch.update({ where: { id: batchId }, data: { totalHkd } });

  const keep = [paymentId, ...riderPaymentIds, ...found.map((p) => p.id)];
  // Unticked bills leave the batch.
  await prisma.payment.updateMany({ where: { batchId, id: { notIn: keep } }, data: { batchId: null } });
  await prisma.payment.updateMany({ where: { id: { in: keep } }, data: { batchId } });

  // Partners that were in another batch may have left it with a single payment.
  const oldBatches = new Set(found.map((p) => p.batchId).filter((b): b is string => !!b && b !== batchId));
  for (const b of oldBatches) await cleanupBatch(b);
  await cleanupBatch(batchId);
  return unpriced;
}

/** A batch with fewer than two payments isn't a combined bill any more. */
async function cleanupBatch(batchId: string) {
  const left = await prisma.payment.count({ where: { batchId } });
  if (left >= 2) return;
  await prisma.payment.updateMany({ where: { batchId }, data: { batchId: null } });
  await prisma.paymentBatch.delete({ where: { id: batchId } });
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const p = await prisma.payment.findFirst({
    where: { id: paymentId, term: { item: { userId } } },
    select: { id: true, paidAt: true, batchId: true, term: { select: { itemId: true } } },
  });
  if (!p) return fail("Payment not found.");
  // Rider payments on the same date are edited together with this one, so they go too.
  const riderPayments = await prisma.payment.findMany({
    where: { paidAt: p.paidAt, term: { item: { userId, parentId: p.term.itemId } } },
    select: { id: true, batchId: true },
  });
  await prisma.payment.deleteMany({ where: { id: { in: [paymentId, ...riderPayments.map((r) => r.id)] } } });
  for (const b of new Set([p.batchId, ...riderPayments.map((r) => r.batchId)])) if (b) await cleanupBatch(b);
  revalidatePath(`/bills/${p.term.itemId}`);
  return { ok: true, id: p.term.itemId };
}

// ---------- reminders (items and utilities) ----------

const LEAD_UNITS: LeadUnitName[] = ["HOUR", "DAY", "WEEK", "MONTH"];

export async function saveReminders(
  target: { itemId: string } | { utilityId: string },
  reminders: { offset: number; unit: LeadUnitName }[]
): Promise<ActionResult> {
  const userId = await requireUserId();
  const clean = reminders
    .filter((r) => LEAD_UNITS.includes(r.unit) && Number.isInteger(r.offset) && r.offset >= 1 && r.offset <= 99)
    .slice(0, 5);

  if ("itemId" in target) {
    if (!(await ownItem(userId, target.itemId))) return fail("Item not found.");
    await prisma.$transaction([
      prisma.reminder.deleteMany({ where: { itemId: target.itemId } }),
      prisma.reminder.createMany({ data: clean.map((r) => ({ ...r, itemId: target.itemId })) }),
    ]);
    revalidatePath(`/bills/${target.itemId}`);
  } else {
    const u = await prisma.utility.findFirst({ where: { id: target.utilityId, userId }, select: { id: true } });
    if (!u) return fail("Utility not found.");
    await prisma.$transaction([
      prisma.reminder.deleteMany({ where: { utilityId: u.id } }),
      prisma.reminder.createMany({ data: clean.map((r) => ({ ...r, utilityId: u.id })) }),
    ]);
    revalidatePath("/utilities");
  }
  return { ok: true };
}
