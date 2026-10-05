// Reads shared by the main pages and the daily job, which pre-loads them into the cache
// (src/lib/cache.ts) each morning so the first page view of the day doesn't wake the database.
// The pages and the job must call these same functions: the cache key is the query itself.
import { db } from "./cache";

/** Bills list: main bills with their terms, latest payment and riders. */
export function billsList(userId: string) {
  return db(userId).item.findMany({
    where: { userId, parentId: null },
    orderBy: [{ categoryGroup: "asc" }, { name: "asc" }],
    include: {
      paymentMethod: { select: { label: true } },
      terms: {
        orderBy: { startDate: "asc" },
        include: {
          payments: { orderBy: { paidAt: "desc" }, take: 1, select: { paidAt: true, channel: true, batchId: true } },
          instalments: { select: { dueDate: true } },
        },
      },
      riders: { include: { terms: { orderBy: { startDate: "desc" }, take: 1 } } },
    },
  });
}

/** One bill's page: the bill, its terms with payments and instalments, and its riders. */
export function billPage(userId: string, id: string) {
  return db(userId).item.findFirst({
    where: { id, userId },
    include: {
      parent: { select: { id: true, name: true } },
      paymentMethod: { select: { label: true } },
      riders: { orderBy: { name: "asc" }, include: { terms: { orderBy: { startDate: "asc" } } } },
      terms: {
        orderBy: { startDate: "asc" },
        include: {
          payments: { orderBy: { paidAt: "asc" }, include: { paymentMethod: { select: { label: true } } } },
          instalments: { orderBy: { dueDate: "asc" } },
        },
      },
    },
  });
}

/** Utilities page: active utilities with their bills, newest first. */
export function utilitiesList(userId: string) {
  return db(userId).utility.findMany({
    where: { userId, isActive: true },
    orderBy: { name: "asc" },
    include: {
      bills: { orderBy: { periodStart: "desc" }, include: { paymentMethod: { select: { label: true } } } },
    },
  });
}

/** Cards page: every payment method, archived ones included. */
export function allMethods(userId: string) {
  return db(userId).paymentMethod.findMany({ where: { userId }, orderBy: { label: "asc" } });
}

/** The Google Calendar the user syncs into. */
export function calendarSetting(userId: string) {
  return db(userId).user.findUnique({ where: { id: userId }, select: { calendarId: true } });
}
