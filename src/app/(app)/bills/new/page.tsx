import { requireUserId } from "@/lib/session";
import { getCategoryLists, getMethods } from "@/lib/lookups";
import ItemForm from "@/components/ItemForm";
import { BackBar } from "@/components/ui";

export default async function NewItemPage() {
  const userId = await requireUserId();
  const [methods, { groups, categories }] = await Promise.all([getMethods(userId), getCategoryLists(userId)]);
  return (
    <>
      <BackBar href="/bills" label="Back to bills" />
      <h1 className="mb-4 px-1 text-[26px] font-extrabold tracking-tight">Add item</h1>
      <ItemForm
        d={{ name: "", vendor: "", categoryGroup: "", category: "", type: "RECURRING", autoRenew: true, isSavings: false, cancelUrl: "", notes: "" }}
        methods={methods}
        groups={groups}
        categories={categories}
      />
    </>
  );
}
