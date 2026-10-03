import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import PageHeader from "@/components/PageHeader";

// Phase 0: plain list to confirm the seed. Full list + add/edit is Phase 1.
export default async function BillsPage() {
  const userId = await requireUserId();
  const items = await prisma.item.findMany({
    where: { userId, status: "ACTIVE", parentId: null },
    orderBy: [{ categoryGroup: "asc" }, { name: "asc" }],
    select: { id: true, name: true, vendor: true, categoryGroup: true, type: true },
  });
  const groups = Map.groupBy(items, (i) => i.categoryGroup);

  return (
    <>
      <PageHeader title="Bills" sub={`${items.length} active items`} />
      <div className="flex flex-col gap-3">
        {[...groups].map(([group, list]) => (
          <section key={group}>
            <h2 className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">{group}</h2>
            <ul className="rounded-2xl border border-line bg-white px-4">
              {list.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 border-t border-[#EEEFEA] py-3 first:border-t-0">
                  <span>
                    <span className="block text-sm font-bold">{i.name}</span>
                    <span className="text-xs text-muted">{i.vendor}</span>
                  </span>
                  <span className="self-center rounded-full bg-[#E9EAE6] px-2 py-0.5 text-[11px] font-bold text-[#45505A]">
                    {i.type}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
