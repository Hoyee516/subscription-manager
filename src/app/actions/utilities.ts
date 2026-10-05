"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dataChanged } from "@/lib/cache";
import { requireUserId } from "@/lib/session";
import { parseDay } from "@/lib/dates";
import { syncLater } from "@/lib/remind";
import type { ActionResult } from "./items";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
function decimal(v: string): Prisma.Decimal | null {
  const s = v.replace(/,/g, "");
  if (!s || !/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return new Prisma.Decimal(s);
}

export async function saveUtilityBill(utilityId: string, billId: string | null, fd: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const u = await prisma.utility.findFirst({ where: { id: utilityId, userId }, select: { id: true } });
  if (!u) return { ok: false, error: "Utility not found." };

  const month = str(fd, "billMonth"); // "2026-10"
  const periodStart = /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : null;
  const amount = decimal(str(fd, "amount"));
  if (!periodStart || amount === null) return { ok: false, error: "Fill in the bill month and amount." };
  const creditRaw = str(fd, "credit");
  const credit = creditRaw ? decimal(creditRaw) : null;
  if (creditRaw && credit === null) return { ok: false, error: "Subsidy / credit must be a number, e.g. -256.31." };

  const methodId = str(fd, "paymentMethodId") || null;
  const method = methodId
    ? await prisma.paymentMethod.findFirst({ where: { id: methodId, userId }, select: { id: true } })
    : null;

  const data = {
    periodStart,
    amount,
    credit: credit && credit.gt(0) ? credit.neg() : credit, // credits are stored as negatives
    dueDate: parseDay(fd.get("dueDate")),
    paidAt: parseDay(fd.get("paidAt")),
    paymentMethodId: method?.id ?? null,
    note: str(fd, "note") || null,
  };

  const clash = await prisma.utilityBill.findFirst({
    where: { utilityId, periodStart, ...(billId ? { NOT: { id: billId } } : {}) },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "There's already a bill for that month. Edit that one instead." };

  if (billId) {
    const b = await prisma.utilityBill.findFirst({ where: { id: billId, utilityId }, select: { id: true } });
    if (!b) return { ok: false, error: "Bill not found." };
    await prisma.utilityBill.update({ where: { id: billId }, data });
  } else {
    await prisma.utilityBill.create({ data: { ...data, utilityId } });
  }
  syncLater(userId, { utilityId });
  revalidatePath("/utilities");
  dataChanged(userId);
  return { ok: true, id: utilityId };
}

export async function deleteUtilityBill(billId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const b = await prisma.utilityBill.findFirst({ where: { id: billId, utility: { userId } }, select: { id: true, utilityId: true } });
  if (!b) return { ok: false, error: "Bill not found." };
  await prisma.utilityBill.delete({ where: { id: billId } });
  syncLater(userId, { utilityId: b.utilityId });
  revalidatePath("/utilities");
  dataChanged(userId);
  return { ok: true, id: b.utilityId };
}
