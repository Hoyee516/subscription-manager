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
      if (opts.goTo) router.push(opts.goTo(res.id));
      router.refresh();
    });
  }

  return { pending, run };
}
