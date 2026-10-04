import { Loader2 } from "lucide-react";

/** Shown instantly while any page in the app fetches its data. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-2 pt-32 text-muted">
      <Loader2 size={28} className="animate-spin text-brand" />
      <span className="text-[13px] font-semibold">Loading…</span>
    </div>
  );
}
