"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { parseDay } from "@/lib/dates";
import { CHANNELS, CYCLE_UNITS, ITEM_TYPES, type LeadUnitName } from "@/lib/billing";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

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
    cancelUrl: optStr(fd, "cancelUrl"),
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
  const commitment = parseInt(str(fd, "commitmentMonths"), 10);
  return {
    startDate,
    endDate,
    dueDate: parseDay(fd.get("dueDate")),
    amount,
    currency: str(fd, "currency") || "HKD",
    amountHkd: decimal(fd, "amountHkd"),
    cycleUnit: cycleUnit as (typeof CYCLE_UNITS)[number]["value"],
    cycleCount,
    commitmentMonths: Number.isFinite(commitment) && commitment > 0 ? commitment : null,
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
    data: { ...item, userId, terms: { create: { ...term, paymentMethodId } } },
  });
  revalidatePath("/bills");
  return { ok: true, id: created.id };
}

export async function updateItem(itemId: string, fd: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!(await ownItem(userId, itemId))) return fail("Item not found.");
  const item = readItemFields(fd);
  if (!item) return fail("Fill in name, vendor, category and billing type.");
  await prisma.item.update({ where: { id: itemId }, data: item });
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
  const paymentMethodId = await ownMethod(userId, optStr(fd, "paymentMethodId"));

  if (termId) {
    const t = await ownTerm(userId, termId);
    if (!t || t.itemId !== itemId) return fail("Term not found.");
    await prisma.term.update({ where: { id: termId }, data: { ...term, paymentMethodId } });
  } else {
    await prisma.term.create({ data: { ...term, itemId, paymentMethodId } });
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
    batchRef: optStr(fd, "batchRef"),
    note: optStr(fd, "note"),
  };

  if (paymentId) {
    const p = await prisma.payment.findFirst({ where: { id: paymentId, termId } });
    if (!p) return fail("Payment not found.");
    await prisma.payment.update({ where: { id: paymentId }, data });
  } else {
    await prisma.payment.create({ data: { ...data, termId } });
  }
  revalidatePath(`/bills/${t.itemId}`);
  return { ok: true, id: t.itemId };
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const p = await prisma.payment.findFirst({
    where: { id: paymentId, term: { item: { userId } } },
    select: { id: true, term: { select: { itemId: true } } },
  });
  if (!p) return fail("Payment not found.");
  await prisma.payment.delete({ where: { id: paymentId } });
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
