// Server data cache: page reads are kept per user until something changes, so most page
// views don't touch the database (Neon stays asleep and pages load fast).
//
//  · db(userId).<model>.<findMany|findFirst|…>(args) — a cached read. The cache key is the
//    user, today's date in Hong Kong, the deployment, and the query itself.
//  · dataChanged(userId) — call after every write in a Server Action: clears that user's cache
//    at once, so the page you go back to shows the change.
//  · dataChangedOutsideAction(userId) — the same from the daily job and the calendar sync.
//
// A new day (HKT) or a new deployment starts a fresh cache. Reads inside Server Actions
// (ownership checks before writing) and the calendar sync's own reads stay uncached.
import { unstable_cache, revalidateTag, updateTag } from "next/cache";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { todayHK } from "./dates";

const tagOf = (userId: string) => `user:${userId}`;
const DEPLOY = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

// The cache stores JSON, which would turn dates and Prisma decimals into plain strings.
// They're tagged on the way in and rebuilt on the way out, so pages get the same types.
export function encode(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    const raw = this[key];
    if (raw instanceof Date) return { $date: raw.toISOString() };
    if (Prisma.Decimal.isDecimal(raw)) return { $dec: (raw as Prisma.Decimal).toString() };
    return v;
  });
}

export function decode<T>(text: string): T {
  return JSON.parse(text, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length === 1 && keys[0] === "$date") return new Date(v.$date);
      if (keys.length === 1 && keys[0] === "$dec") return new Prisma.Decimal(v.$dec);
    }
    return v;
  }) as T;
}

/** Runs `load` at most once per user, day and data change; later calls get the stored result. */
export async function cached<T>(userId: string, key: string[], load: () => Promise<T>): Promise<T> {
  const day = todayHK().toISOString().slice(0, 10);
  const run = unstable_cache(async () => encode(await load()), [DEPLOY, userId, day, ...key], {
    tags: [tagOf(userId)],
    revalidate: 86_400,
  });
  return decode<T>(await run());
}

const READS = ["findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow", "count"] as const;
type Read = (typeof READS)[number];
type Model = "item" | "term" | "payment" | "paymentMethod" | "termInstalment" | "paymentBatch" | "utility" | "utilityBill" | "alert" | "user";
type Reader = { [M in Model]: Pick<PrismaClient[M], Read & keyof PrismaClient[M]> };

/** Cached, read-only Prisma: db(userId).item.findMany({ where: { userId, … } }). Every query must still filter by the user. */
export function db(userId: string): Reader {
  return new Proxy({} as Reader, {
    get(_target, model: string) {
      return new Proxy(
        {},
        {
          get(_m, method: string) {
            if (!(READS as readonly string[]).includes(method)) throw new Error(`db(): ${method} isn't a cached read`);
            return (args?: unknown) =>
              cached(userId, [model, method, encode(args ?? null)], () =>
                (prisma as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[model][method](args)
              );
          },
        }
      );
    },
  });
}

/** After a write in a Server Action: the next page view reads the database again. */
export function dataChanged(userId: string) {
  updateTag(tagOf(userId));
}

/** After a write outside a Server Action (daily job, calendar sync). */
export function dataChangedOutsideAction(userId: string) {
  revalidateTag(tagOf(userId), { expire: 0 });
}
