"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { dataChanged } from "@/lib/cache";
import { requireUserId } from "@/lib/session";
import type { ActionResult } from "./items";

const TYPES = ["CARD", "BANK", "OTHER"] as const;

function read(fd: FormData) {
  const label = String(fd.get("label") ?? "").trim();
  const type = String(fd.get("type") ?? "");
  if (!label || !TYPES.includes(type as (typeof TYPES)[number])) return null;
  // Expiry: month 1–12 and a 4-digit year, both or neither.
  const m = Number(fd.get("expiryMonth") || 0);
  const y = Number(fd.get("expiryYear") || 0);
  const hasExpiry = Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y) && y >= 2000 && y <= 2100;
  return {
    label,
    type: type as (typeof TYPES)[number],
    issuer: String(fd.get("issuer") ?? "").trim() || null,
    expiryMonth: hasExpiry ? m : null,
    expiryYear: hasExpiry ? y : null,
  };
}

export async function saveMethod(id: string | null, fd: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const data = read(fd);
  if (!data) return { ok: false, error: "Enter a name and type." };
  if (!data.expiryMonth !== !fd.get("expiryMonth") || !data.expiryYear !== !fd.get("expiryYear"))
    return { ok: false, error: "Pick both the expiry month and year, or neither." };
  const clash = await prisma.paymentMethod.findFirst({ where: { userId, label: data.label, id: id ? { not: id } : undefined } });
  if (clash) return { ok: false, error: `"${data.label}" already exists.` };
  if (id) {
    const own = await prisma.paymentMethod.findFirst({ where: { id, userId } });
    if (!own) return { ok: false, error: "Payment method not found." };
    await prisma.paymentMethod.update({ where: { id }, data });
  } else {
    await prisma.paymentMethod.create({ data: { ...data, userId } });
  }
  revalidatePath("/cards");
  revalidatePath("/");
  dataChanged(userId);
  return { ok: true };
}

/** Archive hides a method from pickers; past payments keep showing it. */
export async function setMethodActive(id: string, isActive: boolean): Promise<ActionResult> {
  const userId = await requireUserId();
  const own = await prisma.paymentMethod.findFirst({ where: { id, userId } });
  if (!own) return { ok: false, error: "Payment method not found." };
  await prisma.paymentMethod.update({ where: { id }, data: { isActive } });
  revalidatePath("/cards");
  dataChanged(userId);
  return { ok: true };
}
