"use client";
import { setItemStatus } from "@/app/actions/items";
import { useAction } from "./useAction";

export default function ItemStatusActions({ itemId, status }: { itemId: string; status: string }) {
  const { pending, run } = useAction();

  if (status !== "ACTIVE") {
    return (
      <button
        type="button"
        disabled={pending}
        className="py-2 text-center text-[13px] font-bold text-brand"
        onClick={() => run(() => setItemStatus(itemId, "ACTIVE"), { success: "Marked as active" })}
      >
        Mark as active again
      </button>
    );
  }

  return (
    <div className="flex justify-center gap-6 py-2">
      <button
        type="button"
        disabled={pending}
        className="text-[13px] font-bold text-muted"
        onClick={() => run(() => setItemStatus(itemId, "ENDED"), { success: "Marked as ended" })}
      >
        Mark as ended
      </button>
      <button
        type="button"
        disabled={pending}
        className="text-[13px] font-bold text-hike-ink"
        onClick={() => {
          if (confirm("Mark this as cancelled? You can undo this later.")) {
            run(() => setItemStatus(itemId, "CANCELLED"), { success: "Marked as cancelled" });
          }
        }}
      >
        Mark as cancelled
      </button>
    </div>
  );
}
