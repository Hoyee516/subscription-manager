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
  await prisma.term.delete({ where: { id: termId } });
  revalidatePath(`/bills/${t.itemId}`);
  revalidatePath("/bills");
  return { ok: true, id: t.itemId };
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
  const partners = picked.length
    ? await prisma.item.findMany({
        where: { id: { in: picked, not: t.itemId }, userId, categoryGroup: self.categoryGroup, vendor: self.vendor },
        select: { id: true, name: true },
      })
    : [];
  const combinedTotal = decimal(fd, "combinedTotal");

  let id = paymentId;
  if (paymentId) {
    const p = await prisma.payment.findFirst({ where: { id: paymentId, termId } });
    if (!p) return fail("Payment not found.");
    await prisma.payment.update({ where: { id: paymentId }, data });
  } else {
    id = (await prisma.payment.create({ data: { ...data, termId } })).id;
  }

  const missing = await linkBatch(id!, paidAt, partners, combinedTotal);

  revalidatePath(`/bills/${t.itemId}`);
  revalidatePath("/bills");
  return {
    ok: true,
    id: t.itemId,
    warning: missing.length
      ? `No payment on the same date found for: ${missing.join(", ")}. Log it there and pick this bill to link it.`
      : undefined,
  };
}

/**
 * Links a payment to the same-date payments of the partner bills (both ways),
 * so opening any of them shows the same combined bill. Returns partner names
 * that have no payment on that date yet.
 */
async function linkBatch(
  paymentId: string,
  paidAt: Date,
  partners: { id: string; name: string }[],
  totalHkd: Prisma.Decimal | null
): Promise<string[]> {
  const current = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { batchId: true, term: { select: { itemId: true } } },
  });

  if (partners.length === 0) {
    if (current.batchId) {
      await prisma.payment.update({ where: { id: paymentId }, data: { batchId: null } });
      await cleanupBatch(current.batchId);
    }
    return [];
  }

  const found: { id: string; batchId: string | null }[] = [];
  const missing: string[] = [];
  for (const it of partners) {
    const p = await prisma.payment.findFirst({
      where: { paidAt, term: { itemId: it.id } },
      select: { id: true, batchId: true },
    });
    if (p) found.push(p);
    else missing.push(it.name);
  }

  const batchId =
    current.batchId ??
    found.find((p) => p.batchId)?.batchId ??
    (await prisma.paymentBatch.create({ data: { totalHkd }, select: { id: true } })).id;
  await prisma.paymentBatch.update({ where: { id: batchId }, data: { totalHkd } });

  const keep = [paymentId, ...found.map((p) => p.id)];
  // Unticked bills leave the batch.
  await prisma.payment.updateMany({ where: { batchId, id: { notIn: keep } }, data: { batchId: null } });
  await prisma.payment.updateMany({ where: { id: { in: keep } }, data: { batchId } });

  // Partners that were in another batch may have left it with a single payment.
  const oldBatches = new Set(found.map((p) => p.batchId).filter((b): b is string => !!b && b !== batchId));
  for (const b of oldBatches) await cleanupBatch(b);
  await cleanupBatch(batchId);
  return missing;
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
    select: { id: true, batchId: true, term: { select: { itemId: true } } },
  });
  if (!p) return fail("Payment not found.");
  await prisma.payment.delete({ where: { id: paymentId } });
  if (p.batchId) await cleanupBatch(p.batchId);
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
