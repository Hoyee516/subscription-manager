"use client";
import { deleteTerm, saveTerm } from "@/app/actions/items";
import TermFields, { type TermDefaults } from "./TermFields";
import { useAction } from "./useAction";
import { Card, btnPrimary } from "./ui";

export default function TermForm({
  itemId,
  termId,
  d,
}: {
  itemId: string;
  termId: string | null;
  d: TermDefaults;
}) {
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => saveTerm(itemId, termId, fd), { success: termId ? "Term saved" : "New term added", goTo: () => `/bills/${itemId}` });
      }}
    >
      <Card className="flex flex-col gap-3.5">
        <TermFields d={d} />
      </Card>
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : termId ? "Save term" : "Add term"}
      </button>
      {termId && (
        <button
          type="button"
          disabled={pending}
          className="py-2 text-[13px] font-bold text-hike-ink"
          onClick={() => {
            if (confirm("Delete this term and its payments?")) {
              run(() => deleteTerm(termId), { success: "Term deleted", goTo: () => `/bills/${itemId}` });
            }
          }}
        >
          Delete term
        </button>
      )}
    </form>
  );
}
