"use client";
import { useEffect } from "react";

/** Remembers the Bills tab you're on, so Back from a bill returns to it. */
export default function RememberTab({ tab }: { tab: string }) {
  useEffect(() => {
    document.cookie = `billsTab=${tab}; path=/; max-age=31536000; samesite=lax`;
  }, [tab]);
  return null;
}
