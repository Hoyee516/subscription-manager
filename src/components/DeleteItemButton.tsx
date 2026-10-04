"use client";
import { deleteItem } from "@/app/actions/items";
import { useAction } from "./useAction";

export default function DeleteItemButton({ itemId, name }: { itemId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      className="py-2 text-[13px] font-bold text-hike-ink"
      onClick={() => {
        if (confirm(`Delete "${name}" with all its terms and payments? This can't be undone. To keep the history, use "Mark as ended" instead.`)) {
          run(() => deleteItem(itemId), { success: "Item deleted", goTo: () => "/bills" });
        }
      }}
    >
      Delete item
    </button>
  );
}
