"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/app/actions/items";

/** Runs a server action, shows a toast, then navigates (or refreshes). */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ActionResult>, opts: { success: string; goTo?: (id?: string) => string }) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(opts.success);
      if (res.warning) toast.warning(res.warning, { duration: 8000 });
      // Navigate OR refresh — calling refresh() right after push() can cancel the
      // navigation and leave you on the form. The action's revalidatePath()
      // already makes the destination page load fresh data.
      if (opts.goTo) router.push(opts.goTo(res.id));
      else router.refresh();
    });
  }

  return { pending, run };
}
