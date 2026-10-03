import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { getCategoryLists, getMethods } from "@/lib/lookups";
import type { ItemTypeName } from "@/lib/billing";
import ItemForm from "@/components/ItemForm";
import DeleteItemButton from "@/components/DeleteItemButton";
import { BackBar } from "@/components/ui";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const item = await prisma.item.findFirst({ where: { id, userId } });
  if (!item) notFound();
  const [methods, { groups, categories }] = await Promise.all([getMethods(userId), getCategoryLists(userId)]);

  return (
    <>
      <BackBar href={`/bills/${id}`} label="Back to item" />
      <h1 className="mb-4 px-1 text-[26px] font-extrabold tracking-tight">Edit item</h1>
      <div className="flex flex-col gap-3">
        <ItemForm
          itemId={id}
          d={{
            name: item.name,
            vendor: item.vendor,
            categoryGroup: item.categoryGroup,
            category: item.category,
            type: item.type as ItemTypeName,
            autoRenew: item.autoRenew,
            isSavings: item.isSavings,
            cancelUrl: item.cancelUrl ?? "",
            notes: item.notes ?? "",
          }}
          methods={methods}
          groups={groups}
          categories={categories}
        />
        <DeleteItemButton itemId={id} name={item.name} />
      </div>
    </>
  );
}
