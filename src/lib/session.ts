import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Every server-side read/write goes through this, and every query filters by
// the returned userId. This is the app's data-isolation rule (in place of RLS).
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}
