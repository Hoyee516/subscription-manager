import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import PageHeader from "@/components/PageHeader";

// Phase 0: proves login + database + seed work. MRC / alerts arrive in Phase 2.
export default async function HomePage() {
  const userId = await requireUserId();
  const [items, terms, payments, bills, methods] = await Promise.all([
    prisma.item.count({ where: { userId } }),
    prisma.term.count({ where: { item: { userId } } }),
    prisma.payment.count({ where: { term: { item: { userId } } } }),
    prisma.utilityBill.count({ where: { utility: { userId } } }),
    prisma.paymentMethod.count({ where: { userId } }),
  ]);
  const rows: [string, number][] = [
    ["Items", items],
    ["Terms (price history)", terms],
    ["Payments", payments],
    ["Utility bills", bills],
    ["Payment methods", methods],
  ];

  return (
    <>
      <PageHeader title="Overview" sub="Setup check: what's in the database" />
      <section className="rounded-2xl border border-line bg-white p-4">
        <ul>
          {rows.map(([label, n]) => (
            <li key={label} className="flex justify-between border-t border-[#EEEFEA] py-2.5 first:border-t-0">
              <span className="text-sm">{label}</span>
              <span className="text-sm font-bold">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
